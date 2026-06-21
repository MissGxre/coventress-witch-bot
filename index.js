const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');
const {
  joinVoiceChannel, createAudioPlayer, createAudioResource,
  AudioPlayerStatus, VoiceConnectionStatus, entersState,
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs       = require('fs');
const path     = require('path');
const ytSearch = require('yt-search');

const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/i;

function getYoutubeTitle(url) {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', ['--js-runtimes', 'node', '--dump-json', '--no-warnings', '--no-playlist', url]);
    let data = '';
    proc.stdout.on('data', chunk => { data += chunk; });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0 || !data) return reject(new Error(`yt-dlp exited with code ${code}`));
      try {
        resolve(JSON.parse(data).title);
      } catch (err) {
        reject(err);
      }
    });
  });
}

function streamYoutubeAudio(url) {
  const proc = spawn('yt-dlp', ['--js-runtimes', 'node', '-f', 'bestaudio', '-o', '-', '--no-playlist', '--quiet', '--no-warnings', url], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  proc.stderrOutput = '';
  proc.on('error', err => {
    proc.stderrOutput += `spawn error: ${err.message}\n`;
    console.error('yt-dlp spawn error:', err.message);
  });
  proc.stderr.on('data', d => {
    proc.stderrOutput += d.toString();
    console.error('yt-dlp:', d.toString());
  });
  return proc;
}

const SPOTIFY_URL_RE   = /^https?:\/\/open\.spotify\.com\/(track|playlist|album)\/([a-zA-Z0-9]+)/i;
const SPOTIFY_TRACK_CAP = 25;

let spotifyToken       = null;
let spotifyTokenExpiry = 0;

async function getSpotifyToken() {
  if (spotifyToken && Date.now() < spotifyTokenExpiry) return spotifyToken;

  const creds = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Spotify auth failed: ${res.status}`);

  const data = await res.json();
  spotifyToken       = data.access_token;
  spotifyTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return spotifyToken;
}

async function spotifyFetch(endpoint) {
  const token = await getSpotifyToken();
  const res   = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Spotify API error: ${res.status}`);
  return res.json();
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} timed out`)), ms)),
  ]);
}

function trackQuery(track) {
  return `${track.name} ${track.artists?.[0]?.name ?? ''}`.trim();
}

async function getSpotifyTracks(type, id) {
  if (type === 'track') {
    const track = await spotifyFetch(`/tracks/${id}`);
    return { name: track.name, queries: [trackQuery(track)] };
  }

  if (type === 'album') {
    const album   = await spotifyFetch(`/albums/${id}`);
    const queries = album.tracks.items.slice(0, SPOTIFY_TRACK_CAP).map(trackQuery);
    return { name: album.name, queries };
  }

  const playlist = await spotifyFetch(`/playlists/${id}`);
  const queries  = playlist.tracks.items
    .filter(item => item.track)
    .slice(0, SPOTIFY_TRACK_CAP)
    .map(item => trackQuery(item.track));
  return { name: playlist.name, queries };
}

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildVoiceStates] });

// ─── Config ──────────────────────────────────────────────────────────────────

const DAILY_CHANNEL_ID     = '1471586957606785249';
const STAFF_ROLE_ID        = '1471950389971652712';
const WELCOME_CHANNEL_ID   = '1471954873313394740';

const REACT_CHANNEL_IDS = [
  '1471588316183793815',
  '1471588142430552184',
  '1471588014592364655',
];
const REACT_EMOJIS = [
  '<:happy:1514843417769672926>',
  '<:shush:1514843367375372328>',
  '<:lol:1515071076303114450>',
];
const QUESTIONS_CHANNEL_ID = '1514779334005489815';

// ─── Welcome Messages ────────────────────────────────────────────────────────

const welcomeMessages = [
  {
    title: '🕯️ A new witch has entered the coven...',
    desc: (user) => `Welcome, ${user}. The candles flickered as you arrived — a sign the spirits have taken notice. You are exactly where you are meant to be. 🖤`,
  },
  {
    title: '🌑 The coven grows stronger...',
    desc: (user) => `${user} has crossed the threshold. We have been expecting you. Pull up a chair by the fire, pour yourself something warm, and make yourself at home among your sisters. 🔮`,
  },
  {
    title: '🌿 A kindred spirit arrives...',
    desc: (user) => `The herbs stirred and the moon shifted — ${user} has found her way to us. Welcome to the coven, witch. May your time here bring you magic, sisterhood, and peace. ✨`,
  },
  {
    title: '🐦‍⬛ The ravens have spoken...',
    desc: (user) => `They circled overhead before you arrived, ${user}. A good omen. Welcome to this sacred space — you are safe, you are seen, and you are so very welcome here. 🌙`,
  },
  {
    title: '🔮 The crystal spoke your name...',
    desc: (user) => `Before you even knocked, ${user}, the scrying glass showed your face. Fate brought you here. Welcome to the coven — we are glad the universe conspired in your favour tonight. 🕸️`,
  },
];

// ─── Daily Blessings ─────────────────────────────────────────────────────────

const dailyBlessings = [
  'May today bring you small moments of pure magic — the kind that sneak up on you and take your breath away. 🌟',
  'You are protected. You are guided. You are never as alone as you feel. Walk boldly, witch. 🖤',
  'The universe placed you here, in this body, at this time, for a reason. Trust the timing. 🌙',
  'May your energy be replenished today. You give so much — may the earth give it back tenfold. 🌿',
  'Something is shifting in your favour right now, even if you cannot feel it yet. Hold on. ✨',
  'May your intuition speak clearly today and may you have the courage to listen to it. 🔮',
  'You are not too much. You are not too little. You are exactly the right amount of magic. 💜',
  'May your path be lit by moonlight, your steps be steady, and your heart be full. 🌕',
  'Old energy is leaving. New energy is arriving. Welcome the change — it was called in by your own power. 🕯️',
  'May every door that opens today lead somewhere worth going. And may you walk through with your head held high. 🚪',
  'The spell you cast on yourself the hardest is the one you tell about who you are. Rewrite it today. 🕸️',
  'Rest is not failure. Stillness is not weakness. Even the moon has phases where she hides. 🌑',
  'May your home feel like a sanctuary, your mind feel like a garden, and your soul feel at peace today. 🌸',
  'You have survived every hard thing that came before this. You will survive this too — and more than survive. 🌒',
  'Today\'s blessing: unexpected joy. May it find you when you least expect it and stay longer than you thought. 🌻',
  'The coven is behind you. Whether near or far, your sisters hold space for your becoming. 🔥',
  'May your words carry weight today, your presence be felt, and your magic be undeniable. 💫',
  'You do not have to earn rest, love, or softness. They are your birthright as a being of this earth. 🌙',
  'Something beautiful is on its way to you. Prepare space for it — in your home, your heart, and your hands. 🌿',
  'May the day be gentle with you. And if it isn\'t — may you be gentle with yourself. 🖤',
];

// ─── Weekly Questions ─────────────────────────────────────────────────────────

const weeklyPolls = [
  {
    question: 'Which element do you feel most connected to right now? 🌿',
    answers: [
      { poll_media: { text: 'Earth', emoji: { name: '🌿' } } },
      { poll_media: { text: 'Air',   emoji: { name: '🌬️' } } },
      { poll_media: { text: 'Fire',  emoji: { name: '🔥' } } },
      { poll_media: { text: 'Water', emoji: { name: '🌊' } } },
    ],
  },
  {
    question: 'Which moon phase resonates with you most? 🌙',
    answers: [
      { poll_media: { text: 'New Moon — fresh starts',    emoji: { name: '🌑' } } },
      { poll_media: { text: 'Waxing — building energy',   emoji: { name: '🌒' } } },
      { poll_media: { text: 'Full Moon — peak power',     emoji: { name: '🌕' } } },
      { poll_media: { text: 'Waning — release & rest',    emoji: { name: '🌘' } } },
    ],
  },
  {
    question: 'What is your main area of practice? ✨',
    answers: [
      { poll_media: { text: 'Divination',   emoji: { name: '🔮' } } },
      { poll_media: { text: 'Herbalism',    emoji: { name: '🌿' } } },
      { poll_media: { text: 'Spellwork',    emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Moon magic',   emoji: { name: '🌙' } } },
    ],
  },
  {
    question: 'How long have you been practicing? 🕸️',
    answers: [
      { poll_media: { text: 'Just starting out',  emoji: { name: '🌱' } } },
      { poll_media: { text: '1–3 years',           emoji: { name: '🌒' } } },
      { poll_media: { text: '3–5 years',           emoji: { name: '🌕' } } },
      { poll_media: { text: '5+ years',            emoji: { name: '⭐' } } },
    ],
  },
  {
    question: 'Which tool feels most essential to your practice? 🖤',
    answers: [
      { poll_media: { text: 'Candles',              emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Crystals',             emoji: { name: '💎' } } },
      { poll_media: { text: 'Tarot / Oracle cards', emoji: { name: '🃏' } } },
      { poll_media: { text: 'Book of Shadows',      emoji: { name: '📖' } } },
    ],
  },
  {
    question: 'When do you feel most connected to your magic? 🌟',
    answers: [
      { poll_media: { text: 'Late at night',    emoji: { name: '🌙' } } },
      { poll_media: { text: 'At dawn',          emoji: { name: '🌅' } } },
      { poll_media: { text: 'During storms',    emoji: { name: '⛈️' } } },
      { poll_media: { text: 'Under the moon',   emoji: { name: '🌕' } } },
    ],
  },
  {
    question: 'Which season feels most magical to you? 🍂',
    answers: [
      { poll_media: { text: 'Spring', emoji: { name: '🌸' } } },
      { poll_media: { text: 'Summer', emoji: { name: '☀️' } } },
      { poll_media: { text: 'Autumn', emoji: { name: '🍂' } } },
      { poll_media: { text: 'Winter', emoji: { name: '❄️' } } },
    ],
  },
  {
    question: 'What first drew you to witchcraft? 🔮',
    answers: [
      { poll_media: { text: 'A book or show',       emoji: { name: '📚' } } },
      { poll_media: { text: 'Family tradition',     emoji: { name: '🕯️' } } },
      { poll_media: { text: 'A gut feeling',        emoji: { name: '✨' } } },
      { poll_media: { text: 'A life event',         emoji: { name: '🌑' } } },
    ],
  },
  {
    question: 'How do you prefer to practice? 💜',
    answers: [
      { poll_media: { text: 'Solo',              emoji: { name: '🌙' } } },
      { poll_media: { text: 'With others',       emoji: { name: '🤝' } } },
      { poll_media: { text: 'Both equally',      emoji: { name: '⚖️' } } },
      { poll_media: { text: 'Still figuring out', emoji: { name: '🌱' } } },
    ],
  },
  {
    question: 'What is your main intention for your craft? 🌿',
    answers: [
      { poll_media: { text: 'Healing',            emoji: { name: '💚' } } },
      { poll_media: { text: 'Protection',         emoji: { name: '🛡️' } } },
      { poll_media: { text: 'Manifestation',      emoji: { name: '⭐' } } },
      { poll_media: { text: 'Spiritual growth',   emoji: { name: '🔮' } } },
    ],
  },
];

const mondayPolls = [
  {
    question: 'Which crystal do you feel most drawn to? 💎',
    answers: [
      { poll_media: { text: 'Amethyst',        emoji: { name: '💜' } } },
      { poll_media: { text: 'Black tourmaline', emoji: { name: '🖤' } } },
      { poll_media: { text: 'Rose quartz',     emoji: { name: '🩷' } } },
      { poll_media: { text: 'Clear quartz',    emoji: { name: '✨' } } },
    ],
  },
  {
    question: 'What is your favourite divination method? 🔮',
    answers: [
      { poll_media: { text: 'Tarot',          emoji: { name: '🃏' } } },
      { poll_media: { text: 'Oracle cards',   emoji: { name: '🌙' } } },
      { poll_media: { text: 'Pendulum',       emoji: { name: '🔮' } } },
      { poll_media: { text: 'Scrying',        emoji: { name: '🪬' } } },
    ],
  },
  {
    question: 'What kind of magic calls to you most? 🕯️',
    answers: [
      { poll_media: { text: 'Candle magic',   emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Sigil magic',    emoji: { name: '✍️' } } },
      { poll_media: { text: 'Kitchen magic',  emoji: { name: '🌿' } } },
      { poll_media: { text: 'Dream magic',    emoji: { name: '🌑' } } },
    ],
  },
  {
    question: 'How do you cleanse your space? 🌿',
    answers: [
      { poll_media: { text: 'Smoke cleansing',  emoji: { name: '🌿' } } },
      { poll_media: { text: 'Sound / bells',    emoji: { name: '🔔' } } },
      { poll_media: { text: 'Salt',             emoji: { name: '🧂' } } },
      { poll_media: { text: 'Moon water',       emoji: { name: '🌕' } } },
    ],
  },
  {
    question: 'Which sabbat is your favourite? 🍂',
    answers: [
      { poll_media: { text: 'Samhain',    emoji: { name: '🎃' } } },
      { poll_media: { text: 'Yule',       emoji: { name: '❄️' } } },
      { poll_media: { text: 'Beltane',    emoji: { name: '🔥' } } },
      { poll_media: { text: 'Litha',      emoji: { name: '☀️' } } },
    ],
  },
  {
    question: 'Do you work with deities? 🌟',
    answers: [
      { poll_media: { text: 'Yes, regularly',       emoji: { name: '✨' } } },
      { poll_media: { text: 'Sometimes',            emoji: { name: '🌙' } } },
      { poll_media: { text: 'I\'m exploring it',   emoji: { name: '🌱' } } },
      { poll_media: { text: 'No, not my path',      emoji: { name: '🖤' } } },
    ],
  },
  {
    question: 'How do you prefer to cast a circle? 🕸️',
    answers: [
      { poll_media: { text: 'Physically walk it',   emoji: { name: '🚶' } } },
      { poll_media: { text: 'Visualise it',         emoji: { name: '👁️' } } },
      { poll_media: { text: 'With a wand / athame', emoji: { name: '🪄' } } },
      { poll_media: { text: 'I don\'t cast one',   emoji: { name: '🌿' } } },
    ],
  },
  {
    question: 'What is your relationship with ancestors / spirits? 🌑',
    answers: [
      { poll_media: { text: 'I honour them regularly', emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Occasionally',            emoji: { name: '🌙' } } },
      { poll_media: { text: 'Still developing it',     emoji: { name: '🌱' } } },
      { poll_media: { text: 'Not part of my practice', emoji: { name: '🖤' } } },
    ],
  },
  {
    question: 'What is your biggest magical goal right now? 💜',
    answers: [
      { poll_media: { text: 'Self-healing',        emoji: { name: '💚' } } },
      { poll_media: { text: 'Deepening knowledge', emoji: { name: '📖' } } },
      { poll_media: { text: 'Building a practice', emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Finding community',   emoji: { name: '🤝' } } },
    ],
  },
  {
    question: 'How do you recharge your magical energy? 🌿',
    answers: [
      { poll_media: { text: 'Spending time in nature', emoji: { name: '🌿' } } },
      { poll_media: { text: 'Meditation',              emoji: { name: '🧘' } } },
      { poll_media: { text: 'Ritual / spellwork',      emoji: { name: '🕯️' } } },
      { poll_media: { text: 'Rest and solitude',        emoji: { name: '🌙' } } },
    ],
  },
];

// ─── Data ────────────────────────────────────────────────────────────────────

const herbs = [
  { name: 'Lavender',    properties: 'Calm, peace, sleep, and purification. Burn it to ease anxiety or tuck it under your pillow for restful dreams.' },
  { name: 'Rosemary',    properties: 'Protection, memory, and clarity. Use in cleansing rituals or carry it to sharpen focus.' },
  { name: 'Mugwort',     properties: 'Psychic visions, dream work, and astral travel. Brew as a tea before divination.' },
  { name: 'Sage',        properties: 'Cleansing, wisdom, and banishing negative energy. Burn to clear a space before ritual.' },
  { name: 'Chamomile',   properties: 'Luck, love, and prosperity. Add to money spells or drink before sleep to invite good fortune.' },
  { name: 'Thyme',       properties: 'Courage, healing, and fairy contact. Carry it to boost confidence or wear to attract fae.' },
  { name: 'Basil',       properties: 'Love, wealth, and protection. Place near your door to ward off ill will and invite abundance.' },
  { name: 'Bay Laurel',  properties: 'Prophecy, success, and purification. Write a wish on a bay leaf and burn it to manifest.' },
  { name: 'Dandelion',   properties: 'Wishes, divination, and communication with spirits. Blow the seeds and set your intention.' },
  { name: 'Rose',        properties: 'Love, beauty, and psychic power. Red for passion, white for purity, black for endings and new beginnings.' },
  { name: 'Wormwood',    properties: 'Psychic power, protection, and calling spirits. Use in divination rituals and spirit work.' },
  { name: 'Vervain',     properties: 'Protection, purification, and love. Hang above doorways to ward off evil and attract good fortune.' },
  { name: 'Yarrow',      properties: 'Courage, love, and psychic awareness. Carry it to banish fear and enhance intuition.' },
  { name: 'Black Cohosh', properties: 'Love, courage, and potency. Use in spells requiring boldness or to break hexes placed upon you.' },
  { name: 'Elder Flower', properties: 'Protection, healing, and fairy magic. Never burn elder wood — it offends the spirits who dwell within.' },
];

const spells = [
  { name: 'Mirror Spell',           desc: 'Place a small mirror facing outward on your windowsill. Visualise any negativity sent your way being reflected back to its source, neutralised by moonlight.' },
  { name: 'Candle Intention Ritual', desc: 'Carve your intention into a candle with a pin. Anoint it with oil, light it, and focus your will until it burns down completely.' },
  { name: 'Salt Circle Cleanse',    desc: 'Walk the perimeter of your room sprinkling salt, reciting: *"Only peace may enter here, only love may linger near."* Sweep it up at dawn.' },
  { name: 'Moon Water Blessing',    desc: 'Leave a jar of water under the full moon overnight. Use it to bless objects, anoint yourself, or water plants you want to thrive.' },
  { name: 'Paper Burning Release',  desc: 'Write down what you wish to release on a piece of paper. Take it outside, burn it safely, and let the smoke carry it away.' },
  { name: 'Knot Magic',             desc: 'Tie seven knots in a cord while chanting your desire. Each knot seals the intent. Untie them once your wish is granted.' },
  { name: 'Crystal Grid',           desc: 'Arrange crystals in a geometric pattern with your intention stone at the centre. Activate by drawing an invisible line between each stone with your fingertip.' },
  { name: 'Threshold Ward',         desc: 'Mix black pepper, salt, and dried rosemary. Sprinkle across your doorstep to create a protective barrier that harmful energies cannot cross.' },
  { name: 'Smoke Cleansing',        desc: 'Light dried herbs and let the smoke drift through every corner of your space. Speak aloud what you are clearing out and what you are welcoming in.' },
  { name: 'Sigil Charging',         desc: 'Draw a sigil representing your desire. Charge it under moonlight, then burn or bury it to release the intention into the universe.' },
];

const mantras = [
  'I am exactly where I need to be. 🌙',
  'My energy is a gift — I choose where it goes. ✨',
  'I release what no longer serves me and welcome what is meant for me. 🕯️',
  'I am rooted, I am powerful, I am whole. 🌿',
  'The universe is always working in my favour, even when I cannot see it. 🌟',
  'I trust my intuition. It has never truly led me astray. 🔮',
  'I am worthy of the magic I am calling in. 💜',
  'Every ending is a doorway. I walk through with courage. 🚪',
  'I am the calm within the storm. Nothing can shake what is rooted in love. 🌒',
  'Today I choose peace over chaos, and intention over impulse. 🖤',
  'My power does not diminish when I rest. Healing is also magic. 🌙',
  'I am a work in progress and that is something to celebrate. ✨',
  'What is mine will find me. I do not need to chase what belongs to me. 🌿',
  'I honour the darkness as much as the light — both are sacred. 🕸️',
  'My voice matters. My presence matters. I matter. 💜',
];

const hexes = [
  'may their WiFi disconnect at the worst possible moment 📡',
  'may their tea always go cold before they finish it ☕',
  'may they always step on Lego in the dark 🧱',
  'may their headphones tangle every single time 🎧',
  'may their alarms go off 5 minutes after they finally fall asleep 🔔',
  'may their phone battery die at 2% forever 🔋',
  'may autocorrect betray them in every important text 📱',
  'may they always get the wobbly shopping trolley 🛒',
];

const blessings = [
  'may your coffee be strong and your Monday be short ☕✨',
  'may every song that shuffles be exactly what you needed to hear 🎵',
  'may you always find a parking spot right away 🚗',
  'may your code compile on the first try 💻✨',
  'may all your houseplants thrive and your enemies wilt 🌿',
  'may you wake up before your alarm feeling genuinely rested 🌙',
  'may good news find you when you need it most 💌',
  'may the universe conspire in your favour today 🌟',
];

const predictions = [
  { title: '🔮 The Path Ahead', text: 'A chapter you have been struggling to close will finally end — not with a dramatic slam, but with a quiet, knowing exhale. What follows is lighter than you expect.' },
  { title: '🌙 What the Stars See', text: 'Someone unexpected is about to walk into your life and shift something fundamental. You won\'t realise the significance until later, but your gut will know immediately.' },
  { title: '✨ The Veil Speaks', text: 'A decision you\'ve been avoiding can no longer wait. The universe will gently — then firmly — push you toward it. Trust that you already know the answer.' },
  { title: '🕯️ The Flame Reveals', text: 'Abundance is coming, but not in the shape you\'ve been expecting. Let go of the specific vision and stay open to how it actually arrives — it will be better.' },
  { title: '🌿 The Earth Whispers', text: 'A relationship in your life is about to deepen significantly. Whether romantic, friendship, or family — something between you and another person is on the edge of becoming real.' },
  { title: '🌑 Shadows and Light', text: 'You are about to be tested in patience. It will feel like nothing is moving, but beneath the surface everything is shifting. The breakthrough is closer than the silence suggests.' },
  { title: '🕸️ Threads of Fate', text: 'Something you lost — an opportunity, a feeling, a version of yourself — is finding its way back to you. This time you will know what to do with it.' },
  { title: '🌊 The Current Turns', text: 'A period of rest is ending. You have healed more than you know and built more than you can see. What comes next is the payoff for everything you quietly endured.' },
  { title: '⭐ Written in Stars', text: 'Be careful what you speak aloud this week — your words are unusually powerful right now. An intention set with clarity and conviction will move faster than you expect.' },
  { title: '🔥 The Fire Speaks', text: 'You are on the edge of something that will change the way you see yourself. It arrives not as a lightning bolt but as a slow, certain knowing that you cannot unfeel once it lands.' },
];

const dailyHoroscopes = [
  { sign: 'Aries ♈',       reading: 'The fire within you is sharp today — act on instinct, but don\'t burn bridges. A burst of energy mid-afternoon opens a door you\'ve been circling for weeks.' },
  { sign: 'Taurus ♉',      reading: 'Root down before you reach up. Something you planted in patience is finally ready to be seen. Trust the slow magic — it is the most powerful kind.' },
  { sign: 'Gemini ♊',      reading: 'Your words carry unusual weight today. Speak carefully and speak boldly. A conversation you\'ve been avoiding holds the key to something lighter.' },
  { sign: 'Cancer ♋',      reading: 'The moon holds you gently today. Emotions are information — don\'t silence them. Home and comfort are calling, and answering that call is not weakness.' },
  { sign: 'Leo ♌',         reading: 'Your light is undeniable right now. Let yourself be seen without apology. Someone is watching not to judge, but to be inspired.' },
  { sign: 'Virgo ♍',       reading: 'The details you\'ve been agonising over will sort themselves. Step back from the map and feel the direction. Your body knows before your mind does.' },
  { sign: 'Libra ♎',       reading: 'Balance is not a destination — it\'s a daily practice. Something that felt out of reach finds its way back to centre today. A small beauty catches your eye and stays.' },
  { sign: 'Scorpio ♏',     reading: 'You sense what others miss. Trust that. The undercurrents today are working in your favour. Stillness is your power — let others show their hands first.' },
  { sign: 'Sagittarius ♐', reading: 'An idea that seemed too big suddenly feels possible. The universe is expanding your vision on purpose. Follow the thread, even if it leads somewhere unexpected.' },
  { sign: 'Capricorn ♑',   reading: 'Your discipline is your magic today. Something you\'ve been building is closer to complete than it looks. Rest is not falling behind — it\'s part of the climb.' },
  { sign: 'Aquarius ♒',    reading: 'You\'re ahead of the curve in ways you can\'t fully see yet. An unconventional path is the right one. What feels strange to others feels like home to you.' },
  { sign: 'Pisces ♓',      reading: 'The veil is thin for you today. Dreams and signs are speaking — write them down. Your intuition is operating at full power. The magic you seek is already within reach.' },
];

// ─── Moon Phase ──────────────────────────────────────────────────────────────

function getMoonPhase() {
  const now = new Date();
  const knownNewMoon = new Date('2000-01-06T18:14:00Z');
  const lunarCycle = 29.53058867;
  const diffDays = (now - knownNewMoon) / (1000 * 60 * 60 * 24);
  const phase = ((diffDays % lunarCycle) + lunarCycle) % lunarCycle;

  const phases = [
    { name: 'New Moon',        emoji: '🌑', range: [0, 1.85],    desc: 'A time for new beginnings, setting intentions, and planting seeds for what you wish to grow.' },
    { name: 'Waxing Crescent', emoji: '🌒', range: [1.85, 7.38],  desc: 'Energy is building. Take action on your intentions and move toward your goals.' },
    { name: 'First Quarter',   emoji: '🌓', range: [7.38, 11.07], desc: 'Challenges arise. Push through and commit to the path you\'ve set.' },
    { name: 'Waxing Gibbous',  emoji: '🌔', range: [11.07, 14.77], desc: 'Refine and adjust. You\'re close — make small improvements to your work.' },
    { name: 'Full Moon',       emoji: '🌕', range: [14.77, 16.61], desc: 'Peak power. Perfect for manifestation, divination, charging crystals, and releasing what no longer serves you.' },
    { name: 'Waning Gibbous',  emoji: '🌖', range: [16.61, 22.15], desc: 'Gratitude and reflection. Share your wisdom and begin letting go.' },
    { name: 'Last Quarter',    emoji: '🌗', range: [22.15, 25.84], desc: 'Release and forgive. Break bad habits and clear out what holds you back.' },
    { name: 'Waning Crescent', emoji: '🌘', range: [25.84, 29.53], desc: 'Rest and surrender. A quiet time for healing, introspection, and preparing for the next cycle.' },
  ];

  const current = phases.find(p => phase >= p.range[0] && phase < p.range[1]) || phases[0];
  return { ...current, day: Math.floor(phase) + 1 };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseEmoji(str) {
  if (!str) return null;
  const match = str.trim().match(/^<(a?):(\w+):(\d+)>$/);
  if (match) return { animated: match[1] === 'a', name: match[2], id: match[3] };
  return { name: str.trim() };
}

// ─── Witch Roles (ordered) ───────────────────────────────────────────────────

const WITCH_ROLES = [
  { roleId: '1514792861143400448', emoji: '<:tarot:1514817814412656761>'      },
  { roleId: '1514792522323460196', emoji: '<:planchette:1514817833903718470>' },
  { roleId: '1514790432146460854', emoji: '<:lavendar:1514817822621171822>'   },
  { roleId: '1514791078677577809', emoji: '<:hat:1514817819626307624>'        },
  { roleId: '1514791747870392531', emoji: '<:Shrooms:1514817812487606352>'    },
  { roleId: '1514791393740984400', emoji: '<:moth:1514817824747552989>'       },
  { roleId: '1514791910147887195', emoji: '<:spellbook:1514817817390743582>'  },
  { roleId: '1514792218655981598', emoji: '<:Moon:1514817826504839168>'       },
  { roleId: '1514792115731828826', emoji: '<:Solar:1514817830661521439>'      },
  { roleId: '1514792009750020178', emoji: '<:Sea:1514817828430151680>'        },
  { roleId: '1514789673350860942', emoji: '<:Witchling:1514817832154697821>'  },
];

// ─── Daily Scheduler ─────────────────────────────────────────────────────────
// Posts at 6:00 PM Los Angeles time every day

function scheduleDaily(client) {
  function getNextPostTime() {
    const now = new Date();
    const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = new Date(laTime);
    target.setHours(18, 0, 0, 0);
    if (laTime >= target) target.setDate(target.getDate() + 1);
    return target - laTime;
  }

  async function postDaily() {
    const channel = await client.channels.fetch(DAILY_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error('Could not find daily channel.');

    const moon    = getMoonPhase();
    const herb    = herbs[Math.floor(Math.random() * herbs.length)];
    const mantra  = mantras[Math.floor(Math.random() * mantras.length)];
    const blessing = dailyBlessings[Math.floor(Math.random() * dailyBlessings.length)];

    const moonEmbed = new EmbedBuilder()
      .setTitle(`${moon.emoji} Tonight's Moon — ${moon.name}`)
      .setDescription(moon.desc)
      .addFields({ name: 'Cycle Day', value: `Day ${moon.day} of 29`, inline: true })
      .setColor(0x6900ff)
      .setFooter({ text: 'Coventress • Daily Moon Phase' });

    const herbEmbed = new EmbedBuilder()
      .setTitle(`🌿 Herb of the Day — ${herb.name}`)
      .setDescription(herb.properties)
      .setColor(0x6900ff)
      .setFooter({ text: 'Coventress • Herb of the Day' });

    const mantraEmbed = new EmbedBuilder()
      .setTitle('✨ Daily Mantra')
      .setDescription(`*${mantra}*`)
      .setColor(0x6900ff)
      .setFooter({ text: 'Coventress • Daily Mantra' });

    const blessingEmbed = new EmbedBuilder()
      .setTitle('🖤 Daily Blessing')
      .setDescription(blessing)
      .setColor(0x6900ff)
      .setFooter({ text: 'Coventress • Daily Blessing' });

    const deleteAfter = 48 * 60 * 60 * 1000;
    for (const embed of [moonEmbed, herbEmbed, mantraEmbed, blessingEmbed]) {
      const msg = await channel.send({ embeds: [embed] });
      setTimeout(() => msg.delete().catch(() => null), deleteAfter);
    }

    setTimeout(postDaily, 24 * 60 * 60 * 1000);
  }

  const msUntilFirst = getNextPostTime();
  console.log(`⏰ First daily post in ${Math.round(msUntilFirst / 1000 / 60)} minutes.`);
  setTimeout(postDaily, msUntilFirst);
}

// ─── Friday Scheduler ────────────────────────────────────────────────────────
// Posts at 12:00 PM Los Angeles time every Friday

function scheduleFriday(client) {
  function getNextFridayTime() {
    const now = new Date();
    const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = new Date(laTime);
    const day = laTime.getDay(); // 0=Sun … 5=Fri
    let daysUntil = (5 - day + 7) % 7;
    if (daysUntil === 0 && (laTime.getHours() > 12 || (laTime.getHours() === 12 && laTime.getMinutes() >= 30))) {
      daysUntil = 7;
    }
    target.setDate(target.getDate() + daysUntil);
    target.setHours(12, 30, 0, 0);
    return target - laTime;
  }

  async function postFriday() {
    const channel = await client.channels.fetch(QUESTIONS_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error('Could not find questions channel.');

    const poll = weeklyPolls[Math.floor(Math.random() * weeklyPolls.length)];

    const msg = await channel.send({
      poll: {
        question: { text: poll.question },
        answers: poll.answers,
        duration: 72,
        allow_multiselect: false,
      },
    });

    setTimeout(() => msg.delete().catch(() => null), 72 * 60 * 60 * 1000);
    setTimeout(postFriday, 7 * 24 * 60 * 60 * 1000);
  }

  const msUntilFirst = getNextFridayTime();
  console.log(`⏰ First Friday poll in ${Math.round(msUntilFirst / 1000 / 60 / 60)} hours.`);
  setTimeout(postFriday, msUntilFirst);
}

// ─── Monday Scheduler ────────────────────────────────────────────────────────
// Posts at 12:00 PM Los Angeles time every Monday

function scheduleMonday(client) {
  function getNextMondayTime() {
    const now = new Date();
    const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = new Date(laTime);
    const day = laTime.getDay(); // 0=Sun … 1=Mon
    let daysUntil = (1 - day + 7) % 7;
    if (daysUntil === 0 && (laTime.getHours() > 12 || (laTime.getHours() === 12 && laTime.getMinutes() >= 30))) {
      daysUntil = 7;
    }
    target.setDate(target.getDate() + daysUntil);
    target.setHours(12, 30, 0, 0);
    return target - laTime;
  }

  async function postMonday() {
    const channel = await client.channels.fetch(QUESTIONS_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error('Could not find questions channel.');

    const poll = mondayPolls[Math.floor(Math.random() * mondayPolls.length)];

    const msg = await channel.send({
      poll: {
        question: { text: poll.question },
        answers: poll.answers,
        duration: 72,
        allow_multiselect: false,
      },
    });

    setTimeout(() => msg.delete().catch(() => null), 72 * 60 * 60 * 1000);
    setTimeout(postMonday, 7 * 24 * 60 * 60 * 1000);
  }

  const msUntilFirst = getNextMondayTime();
  console.log(`⏰ First Monday poll in ${Math.round(msUntilFirst / 1000 / 60 / 60)} hours.`);
  setTimeout(postMonday, msUntilFirst);
}

// ─── Horoscope Scheduler ─────────────────────────────────────────────────────
// Posts at 12:30 PM Los Angeles time every day

function scheduleHoroscope(client) {
  function getNextHoroscopeTime() {
    const now = new Date();
    const laTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const target = new Date(laTime);
    target.setHours(12, 30, 0, 0);
    if (laTime >= target) target.setDate(target.getDate() + 1);
    return target - laTime;
  }

  async function postHoroscope() {
    const channel = await client.channels.fetch(DAILY_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error('Could not find daily channel.');

    const horoscopes = [...dailyHoroscopes].sort(() => Math.random() - 0.5);

    const embed = new EmbedBuilder()
      .setTitle('🔮 Daily Horoscope')
      .setDescription(horoscopes.map(h => `**${h.sign}**\n${h.reading}`).join('\n\n'))
      .setColor(0x6900ff)
      .setFooter({ text: 'Coventress • Daily Horoscope' });

    const msg = await channel.send({ embeds: [embed] });
    setTimeout(() => msg.delete().catch(() => null), 48 * 60 * 60 * 1000);

    setTimeout(postHoroscope, 24 * 60 * 60 * 1000);
  }

  const msUntilFirst = getNextHoroscopeTime();
  console.log(`⏰ First horoscope in ${Math.round(msUntilFirst / 1000 / 60)} minutes.`);
  setTimeout(postHoroscope, msUntilFirst);
}

// ─── Commands ────────────────────────────────────────────────────────────────

const commands = [
  new SlashCommandBuilder()
    .setName('prediction')
    .setDescription('Ask the coven what the future holds for you'),

  new SlashCommandBuilder()
    .setName('moonphase')
    .setDescription('See the current moon phase and its magical meaning'),

  new SlashCommandBuilder()
    .setName('herb')
    .setDescription('Get a random herb and its magical properties'),

  new SlashCommandBuilder()
    .setName('spell')
    .setDescription('Get a spell or ritual suggestion'),

  new SlashCommandBuilder()
    .setName('hex')
    .setDescription('Cast a playful hex on someone')
    .addUserOption(opt =>
      opt.setName('target').setDescription('Who receives the hex?').setRequired(true)),

  new SlashCommandBuilder()
    .setName('blessing')
    .setDescription('Send a blessing to someone')
    .addUserOption(opt =>
      opt.setName('target').setDescription('Who receives the blessing?').setRequired(true)),

  new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('📜 Staff only — manually trigger a welcome for a user')
    .addUserOption(opt =>
      opt.setName('user').setDescription('Who to welcome?').setRequired(true)),

  new SlashCommandBuilder()
    .setName('message')
    .setDescription('📜 Staff only — make Coventress send a custom embed')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to send the message to').setRequired(true))
    .addStringOption(opt =>
      opt.setName('ping').setDescription('Tag everyone or online members?').setRequired(false)
        .addChoices(
          { name: '@everyone', value: 'everyone' },
          { name: '@here', value: 'here' },
        ))
    .addAttachmentOption(opt =>
      opt.setName('image').setDescription('Full-width banner image or GIF').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('thumbnail').setDescription('Small top-right image').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('gif').setDescription('GIF to attach beneath the embed').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('video').setDescription('Video to attach beneath the embed').setRequired(false))
    .addStringOption(opt =>
      opt.setName('link').setDescription('YouTube, Spotify, or any URL to post beneath the embed').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button1_label').setDescription('Label for link button 1').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button1_url').setDescription('URL for link button 1').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button1_emoji').setDescription('Emoji for button 1 — e.g. <:name:id>').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button2_label').setDescription('Label for link button 2').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button2_url').setDescription('URL for link button 2').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button2_emoji').setDescription('Emoji for button 2 — e.g. <:name:id>').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button3_label').setDescription('Label for link button 3').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button3_url').setDescription('URL for link button 3').setRequired(false))
    .addStringOption(opt =>
      opt.setName('button3_emoji').setDescription('Emoji for button 3 — e.g. <:name:id>').setRequired(false))
    .addStringOption(opt =>
      opt.setName('poll_option1_label').setDescription('Label for poll button 1 (pair with option 2 to enable)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('poll_option1_emoji').setDescription('Emoji for poll button 1 — e.g. <:name:id>').setRequired(false))
    .addStringOption(opt =>
      opt.setName('poll_option2_label').setDescription('Label for poll button 2 (pair with option 1 to enable)').setRequired(false))
    .addStringOption(opt =>
      opt.setName('poll_option2_emoji').setDescription('Emoji for poll button 2 — e.g. <:name:id>').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rolemenu')
    .setDescription('📜 Staff only — post the witch role selection menu')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to post the menu in').setRequired(true))
    .addStringOption(opt =>
      opt.setName('title').setDescription('Embed title — emoji picker works here').setRequired(true))
    .addStringOption(opt =>
      opt.setName('colour').setDescription('Hex colour code (default: 6900ff)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('play')
    .setDescription('🎶 Play a song in your voice channel')
    .addStringOption(opt =>
      opt.setName('song').setDescription('Song name, a YouTube link, or a Spotify track/playlist/album link').setRequired(true)),

  new SlashCommandBuilder()
    .setName('skip')
    .setDescription('⏭️ Skip the current song'),

  new SlashCommandBuilder()
    .setName('stop')
    .setDescription('⏹️ Stop the music and leave the voice channel'),

  new SlashCommandBuilder()
    .setName('queue')
    .setDescription('📜 See what songs are queued up'),

  new SlashCommandBuilder()
    .setName('playlist')
    .setDescription('🎶 Manage saved playlists')
    .addSubcommand(sub =>
      sub.setName('save').setDescription('Save the current queue as a playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('load').setDescription('Queue up a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('list').setDescription('List saved playlists'))
    .addSubcommand(sub =>
      sub.setName('show').setDescription('Show the songs in a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true)))
    .addSubcommand(sub =>
      sub.setName('delete').setDescription('Delete a saved playlist')
        .addStringOption(opt => opt.setName('name').setDescription('Playlist name').setRequired(true))),

].map(c => c.toJSON());

// ─── Pending message data (keyed by user ID) ─────────────────────────────────

const pendingMessages = new Map();
const pollVotes       = new Map();

function formatPollTally(poll) {
  const aName = [poll.aEmoji, poll.aLabel].filter(Boolean).join(' ');
  const bName = [poll.bEmoji, poll.bLabel].filter(Boolean).join(' ');
  return `${aName}: ${poll.a.size}   ${bName}: ${poll.b.size}`;
}

// ─── Music ───────────────────────────────────────────────────────────────────

const musicQueues = new Map();

const PLAYLISTS_FILE = path.join(__dirname, 'playlists.json');

function loadPlaylists() {
  try {
    return JSON.parse(fs.readFileSync(PLAYLISTS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function savePlaylists() {
  fs.writeFileSync(PLAYLISTS_FILE, JSON.stringify(playlists, null, 2));
}

const playlists = loadPlaylists();

async function ensureQueue(interaction, voiceChannel) {
  let queue = musicQueues.get(interaction.guild.id);
  if (queue && queue.voiceChannelId !== voiceChannel.id) {
    return { error: `🎶 I'm already playing in <#${queue.voiceChannelId}>. Join that channel to add songs.` };
  }
  if (queue) return { queue };

  let connection;
  try {
    connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: interaction.guild.id,
      adapterCreator: interaction.guild.voiceAdapterCreator,
      selfDeaf: false,
    });
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
  } catch (err) {
    console.error('Voice connect error:', err);
    connection?.destroy();
    return { error: '🔮 Could not join your voice channel — check my permissions.' };
  }

  const player = createAudioPlayer();
  connection.subscribe(player);

  queue = { connection, player, voiceChannelId: voiceChannel.id, textChannel: interaction.channel, songs: [] };
  musicQueues.set(interaction.guild.id, queue);

  player.on(AudioPlayerStatus.Idle, () => {
    queue.songs.shift();
    playNext(interaction.guild.id);
  });

  player.on('error', err => {
    console.error('Audio player error:', err);
    const failedTitle = queue.songs[0]?.title;
    if (failedTitle) queue.textChannel?.send(`🔮 Had trouble playing **${failedTitle}** — skipping.`).catch(() => null);
    queue.songs.shift();
    playNext(interaction.guild.id);
  });

  connection.on(VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
        entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
      ]);
      // Looks like a reconnect is in progress — leave it alone.
    } catch {
      musicQueues.delete(interaction.guild.id);
      connection.destroy();
    }
  });

  connection.on('error', err => console.error('Voice connection error:', err));

  return { queue };
}

function playNext(guildId) {
  const queue = musicQueues.get(guildId);
  if (!queue) return;

  if (queue.currentProcess) {
    queue.currentProcess.kill();
    queue.currentProcess = null;
  }

  if (queue.songs.length === 0) {
    queue.connection.destroy();
    musicQueues.delete(guildId);
    return;
  }

  const song = queue.songs[0];
  const proc = streamYoutubeAudio(song.url);
  queue.currentProcess = proc;

  let gotAudio = false;
  proc.stdout.once('data', () => { gotAudio = true; });
  proc.on('close', code => {
    if (!gotAudio) {
      const detail = proc.stderrOutput.trim().split('\n').slice(-5).join('\n') || `exit code ${code}, no error output`;
      console.error(`yt-dlp produced no audio for "${song.title}": ${detail}`);
      queue.textChannel?.send(`🔮 Couldn't get audio for **${song.title}** — skipping.\n\`\`\`${detail.slice(0, 500)}\`\`\``).catch(() => null);
    }
  });

  queue.player.play(createAudioResource(proc.stdout));
}

// ─── Ready ───────────────────────────────────────────────────────────────────

client.once('ready', async () => {
  console.log(`🔮 Coventress is online as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: [] });
    await rest.put(Routes.applicationGuildCommands(client.user.id, '1458192243520176395'), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }

  scheduleDaily(client);
  scheduleHoroscope(client);
  scheduleFriday(client);
  scheduleMonday(client);
});

// ─── Interactions ─────────────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {

    // /moonphase
    // /prediction
    if (interaction.commandName === 'prediction') {
      const prediction = predictions[Math.floor(Math.random() * predictions.length)];
      const embed = new EmbedBuilder()
        .setTitle(prediction.title)
        .setDescription(prediction.text)
        .setColor(0x6900ff)
        .setFooter({ text: `Requested by ${interaction.user.username} • Coventress` });
      return interaction.reply({ embeds: [embed] });
    }

    // /moonphase
    if (interaction.commandName === 'moonphase') {
      const moon = getMoonPhase();
      const embed = new EmbedBuilder()
        .setTitle(`${moon.emoji} ${moon.name}`)
        .setDescription(moon.desc)
        .addFields({ name: 'Day in Cycle', value: `Day ${moon.day} of 29`, inline: true })
        .setColor(0x6900ff)
        .setFooter({ text: 'Coventress • Moon Phase' });
      return interaction.reply({ embeds: [embed] });
    }

    // /herb
    if (interaction.commandName === 'herb') {
      const herb = herbs[Math.floor(Math.random() * herbs.length)];
      const embed = new EmbedBuilder()
        .setTitle(`🌿 Herb of the Day — ${herb.name}`)
        .setDescription(herb.properties)
        .setColor(0x6900ff)
        .setFooter({ text: 'Coventress • Herb of the Day' });
      return interaction.reply({ embeds: [embed] });
    }

    // /spell
    if (interaction.commandName === 'spell') {
      const spell = spells[Math.floor(Math.random() * spells.length)];
      const embed = new EmbedBuilder()
        .setTitle(`✨ ${spell.name}`)
        .setDescription(spell.desc)
        .setColor(0x6900ff)
        .setFooter({ text: 'Coventress • Spell of the Moment' });
      return interaction.reply({ embeds: [embed] });
    }

    // /hex
    if (interaction.commandName === 'hex') {
      const target = interaction.options.getUser('target');
      const hex = hexes[Math.floor(Math.random() * hexes.length)];
      const embed = new EmbedBuilder()
        .setTitle('🖤 A Hex Has Been Cast')
        .setDescription(`${target}, ${hex}`)
        .setColor(0x6900ff)
        .setFooter({ text: `Hexed by ${interaction.user.username} • Coventress` });
      return interaction.reply({ embeds: [embed] });
    }

    // /blessing
    if (interaction.commandName === 'blessing') {
      const target = interaction.options.getUser('target');
      const blessing = blessings[Math.floor(Math.random() * blessings.length)];
      const embed = new EmbedBuilder()
        .setTitle('🌟 A Blessing Has Been Bestowed')
        .setDescription(`${target}, ${blessing}`)
        .setColor(0x6900ff)
        .setFooter({ text: `Blessed by ${interaction.user.username} • Coventress` });
      return interaction.reply({ embeds: [embed] });
    }

    // /welcome (staff only)
    if (interaction.commandName === 'welcome') {
      const hasRole = interaction.member.roles.cache.has(STAFF_ROLE_ID);
      if (!hasRole) return interaction.reply({ content: '🖤 You do not have permission to use this command.', ephemeral: true });

      const target = interaction.options.getUser('user');
      const member = await interaction.guild.members.fetch(target.id).catch(() => null);
      if (!member) return interaction.reply({ content: 'Could not find that member.', ephemeral: true });

      const welcome    = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
      const avatarUrl  = target.displayAvatarURL({ size: 256, extension: 'png' });

      const embed = new EmbedBuilder()
        .setTitle(welcome.title)
        .setDescription(welcome.desc(target))
        .setThumbnail(avatarUrl)
        .setColor(0x6900ff)
        .setFooter({ text: 'Coventress • Welcome to the Coven' })
        .setTimestamp();

      const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
      if (!channel) return interaction.reply({ content: 'Could not find welcome channel.', ephemeral: true });

      await channel.send({ embeds: [embed] });
      return interaction.reply({ content: `✅ Welcome message sent for ${target}!`, ephemeral: true });
    }

    // /message (staff only)
    if (interaction.commandName === 'message') {
      const hasRole = interaction.member.roles.cache.has(STAFF_ROLE_ID);
      if (!hasRole) {
        return interaction.reply({ content: '🖤 You do not have permission to use this command.', ephemeral: true });
      }

      const targetChannel  = interaction.options.getChannel('channel');
      const imageAttach    = interaction.options.getAttachment('image');
      const thumbAttach    = interaction.options.getAttachment('thumbnail');
      const videoAttach    = interaction.options.getAttachment('gif') || interaction.options.getAttachment('video');

      const buttons = [];
      for (let i = 1; i <= 3; i++) {
        const label = interaction.options.getString(`button${i}_label`);
        const url   = interaction.options.getString(`button${i}_url`);
        const emoji = interaction.options.getString(`button${i}_emoji`);
        if (label && url) buttons.push({ label, url, emoji });
      }

      const option1Label = interaction.options.getString('poll_option1_label');
      const option1Emoji = interaction.options.getString('poll_option1_emoji');
      const option2Label = interaction.options.getString('poll_option2_label');
      const option2Emoji = interaction.options.getString('poll_option2_emoji');
      const hasOption1 = !!(option1Label || option1Emoji);
      const hasOption2 = !!(option2Label || option2Emoji);
      if (hasOption1 !== hasOption2) {
        return interaction.reply({ content: 'Please give both poll buttons a label or emoji, or neither.', ephemeral: true });
      }

      pendingMessages.set(interaction.user.id, {
        channelId: targetChannel.id,
        buttons,
        imageUrl:     imageAttach ? imageAttach.url  : null,
        thumbnailUrl: thumbAttach ? thumbAttach.url  : null,
        videoUrl:     videoAttach ? videoAttach.url  : null,
        videoName:    videoAttach ? videoAttach.name : null,
        link:         interaction.options.getString('link') || null,
        ping:         interaction.options.getString('ping') || null,
        option1Label,
        option1Emoji,
        option2Label,
        option2Emoji,
      });

      const modal = new ModalBuilder()
        .setCustomId('coventress_message_modal')
        .setTitle('Coventress Message Builder');

      const titleInput = new TextInputBuilder()
        .setCustomId('msg_title')
        .setLabel('Title')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 🌙 A Message from the Coven')
        .setRequired(true);

      const bodyInput = new TextInputBuilder()
        .setCustomId('msg_body')
        .setLabel('Message')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Write your message here. Supports markdown and emojis.')
        .setRequired(true);

      const colorInput = new TextInputBuilder()
        .setCustomId('msg_color')
        .setLabel('Colour (hex code)')
        .setStyle(TextInputStyle.Short)
        .setValue('6900ff')
        .setRequired(false);

      const footerInput = new TextInputBuilder()
        .setCustomId('msg_footer')
        .setLabel('Footer text (optional)')
        .setStyle(TextInputStyle.Short)
        .setValue('stay witchy')
        .setRequired(false);

      const contentInput = new TextInputBuilder()
        .setCustomId('msg_content')
        .setLabel('Plain text above embed (optional)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('e.g. 🌙 @everyone or use <:emoji:id> for custom emojis')
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(titleInput),
        new ActionRowBuilder().addComponents(bodyInput),
        new ActionRowBuilder().addComponents(colorInput),
        new ActionRowBuilder().addComponents(footerInput),
        new ActionRowBuilder().addComponents(contentInput),
      );

      return interaction.showModal(modal);
    }

    // /rolemenu (staff only)
    if (interaction.commandName === 'rolemenu') {
      const hasRole = interaction.member.roles.cache.has(STAFF_ROLE_ID);
      if (!hasRole) return interaction.reply({ content: '🖤 You do not have permission to use this command.', ephemeral: true });

      const channel  = interaction.options.getChannel('channel');
      const title    = interaction.options.getString('title');
      const colorRaw = (interaction.options.getString('colour') || '6900ff').replace('#', '').trim();

      pendingMessages.set(interaction.user.id, { channelId: channel.id, title, colorRaw, type: 'rolemenu' });

      const modal = new ModalBuilder()
        .setCustomId('coventress_rolemenu_modal')
        .setTitle('Role Menu — Body Text');

      const bodyInput = new TextInputBuilder()
        .setCustomId('rm_body')
        .setLabel('Message body (press Enter for new lines)')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Write your message here. Use <:name:id> for custom emojis.')
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(bodyInput));
      return interaction.showModal(modal);
    }

    // /play
    if (interaction.commandName === 'play') {
      const voiceChannel = interaction.member.voice.channel;
      if (!voiceChannel) {
        return interaction.reply({ content: '🎵 Join a voice channel first!', ephemeral: true });
      }

      await interaction.deferReply();

      const query = interaction.options.getString('song');
      const queuePromise = ensureQueue(interaction, voiceChannel);

      const songsToAdd = [];
      let spotifySource = null;
      try {
        const spotifyMatch = query.match(SPOTIFY_URL_RE);
        if (spotifyMatch) {
          if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
            return interaction.editReply('🔮 Spotify links aren\'t set up yet — add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the bot\'s environment first.');
          }
          const [, type, id] = spotifyMatch;
          const { name, queries } = await getSpotifyTracks(type, id);
          spotifySource = name;

          for (const q of queries) {
            try {
              const results = await withTimeout(ytSearch(q), 15_000, `YouTube search for "${q}"`);
              const video   = results.videos[0];
              if (video) songsToAdd.push({ title: video.title, url: video.url, requestedBy: interaction.user.username });
            } catch (err) {
              console.error(`Skipping "${q}":`, err.message);
            }
          }
          if (songsToAdd.length === 0) {
            return interaction.editReply(`🔮 Couldn't find any matches on YouTube for **${name}**.`);
          }
        } else if (YOUTUBE_URL_RE.test(query)) {
          const title = await withTimeout(getYoutubeTitle(query), 15_000, 'YouTube lookup');
          songsToAdd.push({ title, url: query, requestedBy: interaction.user.username });
        } else {
          const results = await withTimeout(ytSearch(query), 15_000, 'YouTube search');
          const video   = results.videos[0];
          if (!video) return interaction.editReply('🔮 No results found for that song.');
          songsToAdd.push({ title: video.title, url: video.url, requestedBy: interaction.user.username });
        }
      } catch (err) {
        console.error('Music search error:', err);
        return interaction.editReply('🔮 Something went wrong searching for that song.');
      }

      const { queue, error } = await queuePromise;
      if (error) return interaction.editReply(error);

      const wasEmpty = queue.songs.length === 0;
      queue.songs.push(...songsToAdd);
      if (wasEmpty) playNext(interaction.guild.id);

      if (spotifySource) {
        return interaction.editReply(`🎶 Queued ${songsToAdd.length} song(s) from **${spotifySource}**.`);
      }
      if (wasEmpty) {
        return interaction.editReply(`🎶 Now playing **${songsToAdd[0].title}**`);
      }
      return interaction.editReply(`➕ Added **${songsToAdd[0].title}** to the queue (position ${queue.songs.length})`);
    }

    // /skip
    if (interaction.commandName === 'skip') {
      const queue = musicQueues.get(interaction.guild.id);
      if (!queue || queue.songs.length === 0) {
        return interaction.reply({ content: '🔮 Nothing is playing.', ephemeral: true });
      }
      queue.player.stop();
      return interaction.reply('⏭️ Skipped.');
    }

    // /stop
    if (interaction.commandName === 'stop') {
      const queue = musicQueues.get(interaction.guild.id);
      if (!queue) {
        return interaction.reply({ content: '🔮 I\'m not playing anything.', ephemeral: true });
      }
      musicQueues.delete(interaction.guild.id);
      queue.currentProcess?.kill();
      queue.player.stop();
      queue.connection.destroy();
      return interaction.reply('⏹️ Stopped and left the voice channel.');
    }

    // /queue
    if (interaction.commandName === 'queue') {
      const queue = musicQueues.get(interaction.guild.id);
      if (!queue || queue.songs.length === 0) {
        return interaction.reply({ content: '🔮 The queue is empty.', ephemeral: true });
      }

      const QUEUE_DISPLAY_CAP = 50;
      const list = queue.songs.slice(0, QUEUE_DISPLAY_CAP).map((s, i) =>
        i === 0 ? `▶️ **${s.title}** — requested by ${s.requestedBy}` : `${i}. ${s.title} — requested by ${s.requestedBy}`
      ).join('\n');
      const more = queue.songs.length > QUEUE_DISPLAY_CAP ? `\n…and ${queue.songs.length - QUEUE_DISPLAY_CAP} more` : '';

      const embed = new EmbedBuilder()
        .setTitle('🎶 Music Queue')
        .setDescription(list + more)
        .setColor(0x6900ff);
      return interaction.reply({ embeds: [embed] });
    }

    // /playlist
    if (interaction.commandName === 'playlist') {
      const sub     = interaction.options.getSubcommand();
      const guildId = interaction.guild.id;
      playlists[guildId] = playlists[guildId] || {};
      const guildPlaylists = playlists[guildId];

      if (sub === 'save') {
        const name  = interaction.options.getString('name').trim().toLowerCase();
        const queue = musicQueues.get(guildId);
        if (!queue || queue.songs.length === 0) {
          return interaction.reply({ content: '🔮 Nothing is queued right now — play some songs first, then save them as a playlist.', ephemeral: true });
        }
        guildPlaylists[name] = queue.songs.map(s => ({ title: s.title, url: s.url }));
        savePlaylists();
        return interaction.reply(`📜 Saved **${name}** with ${guildPlaylists[name].length} song(s).`);
      }

      if (sub === 'load') {
        const name  = interaction.options.getString('name').trim().toLowerCase();
        const saved = guildPlaylists[name];
        if (!saved || saved.length === 0) {
          return interaction.reply({ content: `🔮 No playlist named **${name}** found.`, ephemeral: true });
        }

        const voiceChannel = interaction.member.voice.channel;
        if (!voiceChannel) {
          return interaction.reply({ content: '🎵 Join a voice channel first!', ephemeral: true });
        }

        await interaction.deferReply();
        const { queue, error } = await ensureQueue(interaction, voiceChannel);
        if (error) return interaction.editReply(error);

        const wasEmpty = queue.songs.length === 0;
        for (const s of saved) queue.songs.push({ ...s, requestedBy: interaction.user.username });
        if (wasEmpty) playNext(guildId);

        return interaction.editReply(`🎶 Queued ${saved.length} song(s) from **${name}**.`);
      }

      if (sub === 'list') {
        const names = Object.keys(guildPlaylists);
        if (names.length === 0) {
          return interaction.reply({ content: '🔮 No playlists saved yet.', ephemeral: true });
        }
        const list  = names.map(n => `• **${n}** (${guildPlaylists[n].length} songs)`).join('\n');
        const embed = new EmbedBuilder().setTitle('📜 Saved Playlists').setDescription(list).setColor(0x6900ff);
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'show') {
        const name  = interaction.options.getString('name').trim().toLowerCase();
        const saved = guildPlaylists[name];
        if (!saved || saved.length === 0) {
          return interaction.reply({ content: `🔮 No playlist named **${name}** found.`, ephemeral: true });
        }
        const list  = saved.slice(0, 15).map((s, i) => `${i + 1}. ${s.title}`).join('\n');
        const embed = new EmbedBuilder().setTitle(`📜 Playlist — ${name}`).setDescription(list).setColor(0x6900ff);
        return interaction.reply({ embeds: [embed] });
      }

      if (sub === 'delete') {
        const name = interaction.options.getString('name').trim().toLowerCase();
        if (!guildPlaylists[name]) {
          return interaction.reply({ content: `🔮 No playlist named **${name}** found.`, ephemeral: true });
        }
        delete guildPlaylists[name];
        savePlaylists();
        return interaction.reply(`🗑️ Deleted playlist **${name}**.`);
      }
    }
  }

  // ── Button — poll vote ──
  if (interaction.isButton() && interaction.customId.startsWith('coventress_choice:')) {
    const [, choice, pollId] = interaction.customId.split(':');
    const poll = pollVotes.get(pollId);
    if (!poll) return interaction.reply({ content: 'This poll has expired.', ephemeral: true });

    poll.a.delete(interaction.user.id);
    poll.b.delete(interaction.user.id);
    poll[choice].add(interaction.user.id);

    const embed = EmbedBuilder.from(interaction.message.embeds[0])
      .setFields({ name: 'Votes', value: formatPollTally(poll) });

    return interaction.update({ embeds: [embed] });
  }

  // ── Button — role menu ──
  if (interaction.isButton() && interaction.customId.startsWith('rolemenu:')) {
    const roleId = interaction.customId.split(':')[1];
    const role   = interaction.guild.roles.cache.get(roleId);
    if (!role) return interaction.reply({ content: 'That role no longer exists.', ephemeral: true });

    try {
      if (interaction.member.roles.cache.has(roleId)) {
        await interaction.member.roles.remove(roleId);
        return interaction.reply({ content: `✨ Removed the **${role.name}** role.`, ephemeral: true });
      } else {
        await interaction.member.roles.add(roleId);
        return interaction.reply({ content: `🌙 You now have the **${role.name}** role!`, ephemeral: true });
      }
    } catch (err) {
      console.error('Role assign error:', err);
      return interaction.reply({ content: 'Could not update that role — make sure the bot has the **Manage Roles** permission and the role is below the bot\'s highest role.', ephemeral: true });
    }
  }

  // ── Modal Submit — role menu ──
  if (interaction.isModalSubmit() && interaction.customId === 'coventress_rolemenu_modal') {
    const pending = pendingMessages.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: 'Something went wrong. Try /rolemenu again.', ephemeral: true });
    pendingMessages.delete(interaction.user.id);

    const body     = interaction.fields.getTextInputValue('rm_body');
    const colorInt = parseInt(pending.colorRaw, 16);
    const color    = isNaN(colorInt) ? 0x6900ff : colorInt;

    const embed = new EmbedBuilder()
      .setTitle(pending.title)
      .setDescription(body)
      .setColor(color)
      .setFooter({ text: 'Coventress • Role Selection' });

    const rows = [];
    for (let i = 0; i < WITCH_ROLES.length; i += 5) {
      const row = new ActionRowBuilder();
      for (const entry of WITCH_ROLES.slice(i, i + 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`rolemenu:${entry.roleId}`)
            .setStyle(ButtonStyle.Secondary)
            .setEmoji(entry.emoji)
        );
      }
      rows.push(row);
    }

    const targetChannel = await client.channels.fetch(pending.channelId).catch(() => null);
    if (!targetChannel) return interaction.reply({ content: 'Could not find that channel.', ephemeral: true });

    await targetChannel.send({ embeds: [embed], components: rows });
    return interaction.reply({ content: `✅ Role menu posted in <#${pending.channelId}>!`, ephemeral: true });
  }

  // ── Modal Submit ──
  if (interaction.isModalSubmit() && interaction.customId === 'coventress_message_modal') {
    const pending = pendingMessages.get(interaction.user.id);
    if (!pending) return interaction.reply({ content: 'Something went wrong. Try /message again.', ephemeral: true });
    pendingMessages.delete(interaction.user.id);

    const title    = interaction.fields.getTextInputValue('msg_title');
    const body     = interaction.fields.getTextInputValue('msg_body');
    const colorRaw = interaction.fields.getTextInputValue('msg_color').replace('#', '').trim();
    const footer   = interaction.fields.getTextInputValue('msg_footer').trim();
    const content  = interaction.fields.getTextInputValue('msg_content').trim();

    const colorInt = colorRaw ? parseInt(colorRaw, 16) : 0x6900ff;
    const color    = isNaN(colorInt) ? 0x6900ff : colorInt;

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(body)
      .setColor(color);

    if (footer) embed.setFooter({ text: footer });
    if (pending.imageUrl) embed.setImage(pending.imageUrl);
    if (pending.thumbnailUrl) embed.setThumbnail(pending.thumbnailUrl);

    const messageComponents = [];
    if (pending.buttons && pending.buttons.length > 0) {
      const row = new ActionRowBuilder();
      for (const btn of pending.buttons) {
        const button = new ButtonBuilder()
          .setLabel(btn.label)
          .setStyle(ButtonStyle.Link)
          .setURL(btn.url);
        if (btn.emoji) {
          const parsed = parseEmoji(btn.emoji);
          if (parsed) button.setEmoji(parsed);
        }
        row.addComponents(button);
      }
      messageComponents.push(row);
    }

    if ((pending.option1Label || pending.option1Emoji) && (pending.option2Label || pending.option2Emoji)) {
      const pollId = `${interaction.user.id}-${Date.now()}`;
      const poll = {
        a: new Set(), b: new Set(),
        aLabel: pending.option1Label, aEmoji: pending.option1Emoji,
        bLabel: pending.option2Label, bEmoji: pending.option2Emoji,
      };
      pollVotes.set(pollId, poll);

      const btnA = new ButtonBuilder().setCustomId(`coventress_choice:a:${pollId}`).setStyle(ButtonStyle.Primary);
      if (pending.option1Label) btnA.setLabel(pending.option1Label);
      if (pending.option1Emoji) btnA.setEmoji(parseEmoji(pending.option1Emoji));

      const btnB = new ButtonBuilder().setCustomId(`coventress_choice:b:${pollId}`).setStyle(ButtonStyle.Secondary);
      if (pending.option2Label) btnB.setLabel(pending.option2Label);
      if (pending.option2Emoji) btnB.setEmoji(parseEmoji(pending.option2Emoji));

      messageComponents.push(new ActionRowBuilder().addComponents(btnA, btnB));
      embed.addFields({ name: 'Votes', value: formatPollTally(poll) });
    }

    const targetChannel = await client.channels.fetch(pending.channelId).catch(() => null);
    if (!targetChannel) return interaction.reply({ content: 'Could not find that channel.', ephemeral: true });

    const files = [];
    if (pending.videoUrl) {
      files.push({ attachment: pending.videoUrl, name: pending.videoName || 'video' });
    }

    const pingTag      = pending.ping === 'everyone' ? '@everyone' : pending.ping === 'here' ? '@here' : '';
    const finalContent = [pingTag, content].filter(Boolean).join('\n') || undefined;

    await targetChannel.send({
      content: finalContent,
      embeds: [embed],
      components: messageComponents,
      files,
      allowedMentions: pending.ping ? { parse: ['everyone'] } : undefined,
    });

    if (pending.link) await targetChannel.send({ content: pending.link });
    return interaction.reply({ content: `✅ Message sent to <#${pending.channelId}>`, ephemeral: true });
  }

});

// ─── Welcome ─────────────────────────────────────────────────────────────────

client.on('guildMemberAdd', async member => {
  const channel = await client.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
  if (!channel) return;

  const welcome   = welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)];
  const avatarUrl = member.user.displayAvatarURL({ size: 256, extension: 'png' });

  const embed = new EmbedBuilder()
    .setTitle(welcome.title)
    .setDescription(welcome.desc(member.user))
    .setThumbnail(avatarUrl)
    .setColor(0x6900ff)
    .setFooter({ text: 'Coventress • Welcome to the Coven' })
    .setTimestamp();

  await channel.send({ embeds: [embed] });
});

// ─── Login ───────────────────────────────────────────────────────────────────

// ─── Auto React ──────────────────────────────────────────────────────────────

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!REACT_CHANNEL_IDS.includes(message.channel.id)) return;
  const emoji = REACT_EMOJIS[Math.floor(Math.random() * REACT_EMOJIS.length)];
  await message.react(emoji).catch(() => null);
});

client.login(process.env.DISCORD_TOKEN);
