const {
  Client, GatewayIntentBits, REST, Routes,
  SlashCommandBuilder, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder,
  ButtonBuilder, ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// ─── Config ──────────────────────────────────────────────────────────────────

const DAILY_CHANNEL_ID     = '1471586957606785249';
const STAFF_ROLE_ID        = '1471950389971652712';
const WELCOME_CHANNEL_ID   = '1471954873313394740';
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

const weeklyQuestions = [
  '🌙 **This week\'s question:** What is one thing you\'ve been meaning to release but keep holding onto? What\'s stopping you from letting it go?',
  '🔮 **This week\'s question:** Which element do you feel most connected to right now — earth, air, fire, or water — and what does that tell you about where you are in your journey?',
  '🕯️ **This week\'s question:** What does your ideal sacred space look like? Do you have one, or is it still a dream? Tell us what you\'re working with.',
  '🌿 **This week\'s question:** If you could master one area of witchcraft this year — divination, herbalism, moon magic, spellwork, spirit work — what would it be and why?',
  '🌑 **This week\'s question:** What drew you to the craft? Was it one moment, a slow pull, or something you can\'t quite explain?',
  '✨ **This week\'s question:** What\'s a belief, habit, or energy pattern you\'ve been actively working to break? How\'s it going?',
  '🐦‍⬛ **This week\'s question:** Do you have a spirit animal, familiar, or creature you feel deeply connected to? What do you think it reflects about you?',
  '🕸️ **This week\'s question:** What\'s a spell, ritual, or practice that has genuinely worked for you — something you\'d recommend to any witch?',
  '🌕 **This week\'s question:** Moon magic or solar magic — which calls to you more, and how does it show up in your practice?',
  '💜 **This week\'s question:** What\'s something the coven has taught you, shown you, or helped you feel that you didn\'t expect when you first joined?',
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
  { roleId: '1514792861143400448', emoji: { name: 'tarot',      id: '1514817814412656761' } },
  { roleId: '1514792522323460196', emoji: { name: 'planchette', id: '1514817833903718470' } },
  { roleId: '1514790432146460854', emoji: { name: 'lavendar',   id: '1514817822621171822' } },
  { roleId: '1514791078677577809', emoji: { name: 'hat',        id: '1514817819626307624' } },
  { roleId: '1514791747870392531', emoji: { name: 'Shrooms',    id: '1514817812487606352' } },
  { roleId: '1514791393740984400', emoji: { name: 'moth',       id: '1514817824747552989' } },
  { roleId: '1514791910147887195', emoji: { name: 'spellbook',  id: '1514817817390743582' } },
  { roleId: '1514792218655981598', emoji: { name: 'Moon',       id: '1514817826504839168' } },
  { roleId: '1514792115731828826', emoji: { name: 'Solar',      id: '1514817830661521439' } },
  { roleId: '1514792009750020178', emoji: { name: 'Sea',        id: '1514817828430151680' } },
  { roleId: '1514789673350860942', emoji: { name: 'Witchling',  id: '1514817832154697821' } },
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

    await channel.send({ embeds: [moonEmbed] });
    await channel.send({ embeds: [herbEmbed] });
    await channel.send({ embeds: [mantraEmbed] });
    await channel.send({ embeds: [blessingEmbed] });

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
    if (daysUntil === 0 && (laTime.getHours() > 12 || (laTime.getHours() === 12 && laTime.getMinutes() > 0))) {
      daysUntil = 7;
    }
    target.setDate(target.getDate() + daysUntil);
    target.setHours(12, 0, 0, 0);
    return target - laTime;
  }

  async function postFriday() {
    const channel = await client.channels.fetch(QUESTIONS_CHANNEL_ID).catch(() => null);
    if (!channel) return console.error('Could not find questions channel.');

    const question = weeklyQuestions[Math.floor(Math.random() * weeklyQuestions.length)];

    const embed = new EmbedBuilder()
      .setTitle('🔮 Weekly Witch Question')
      .setDescription(question)
      .setColor(0x6900ff)
      .setFooter({ text: 'happy friday witches 🖤' });

    await channel.send({ embeds: [embed] });

    setTimeout(postFriday, 7 * 24 * 60 * 60 * 1000);
  }

  const msUntilFirst = getNextFridayTime();
  console.log(`⏰ First Friday question in ${Math.round(msUntilFirst / 1000 / 60 / 60)} hours.`);
  setTimeout(postFriday, msUntilFirst);
}

// ─── Commands ────────────────────────────────────────────────────────────────

const commands = [
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
    .addAttachmentOption(opt =>
      opt.setName('image').setDescription('Full-width banner image or GIF').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('thumbnail').setDescription('Small top-right image').setRequired(false))
    .addAttachmentOption(opt =>
      opt.setName('gif').setDescription('GIF to attach beneath the embed').setRequired(false))
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
      opt.setName('button3_emoji').setDescription('Emoji for button 3 — e.g. <:name:id>').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rolemenu')
    .setDescription('📜 Staff only — post the witch role selection menu')
    .addChannelOption(opt =>
      opt.setName('channel').setDescription('Channel to post the menu in').setRequired(true))
    .addStringOption(opt =>
      opt.setName('title').setDescription('Embed title — emoji picker works here').setRequired(true))
    .addStringOption(opt =>
      opt.setName('colour').setDescription('Hex colour code (default: 6900ff)').setRequired(false)),

].map(c => c.toJSON());

// ─── Pending message data (keyed by user ID) ─────────────────────────────────

const pendingMessages = new Map();

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
  scheduleFriday(client);
});

// ─── Interactions ─────────────────────────────────────────────────────────────

client.on('interactionCreate', async interaction => {

  // ── Slash Commands ──
  if (interaction.isChatInputCommand()) {

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
      const videoAttach    = interaction.options.getAttachment('gif');

      const buttons = [];
      for (let i = 1; i <= 3; i++) {
        const label = interaction.options.getString(`button${i}_label`);
        const url   = interaction.options.getString(`button${i}_url`);
        const emoji = interaction.options.getString(`button${i}_emoji`);
        if (label && url) buttons.push({ label, url, emoji });
      }

      pendingMessages.set(interaction.user.id, {
        channelId: targetChannel.id,
        buttons,
        imageUrl:     imageAttach ? imageAttach.url  : null,
        thumbnailUrl: thumbAttach ? thumbAttach.url  : null,
        videoUrl:     videoAttach ? videoAttach.url  : null,
        videoName:    videoAttach ? videoAttach.name : null,
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

    const targetChannel = await client.channels.fetch(pending.channelId).catch(() => null);
    if (!targetChannel) return interaction.reply({ content: 'Could not find that channel.', ephemeral: true });

    const files = [];
    if (pending.videoUrl) {
      files.push({ attachment: pending.videoUrl, name: pending.videoName || 'video' });
    }

    await targetChannel.send({
      content: content || undefined,
      embeds: [embed],
      components: messageComponents,
      files,
    });
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

client.login(process.env.DISCORD_TOKEN);
