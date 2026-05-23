import 'dotenv/config';
import {
  ApplicationCommandOptionType,
  ChannelType,
  Client,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { initStore, getSetting, setSetting, logVerificationAttempt, getVerificationLog } from './store';

const { DISCORD_TOKEN } = process.env;
if (!DISCORD_TOKEN) {
  console.error('Missing required environment variable: DISCORD_TOKEN');
  process.exit(1);
}

initStore();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const COMMANDS = [
  {
    name: 'setup-support-access',
    description: 'Configure the support access gate (channel, passphrase, and role)',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
      {
        name: 'channel',
        description: 'Channel where users type the passphrase',
        type: ApplicationCommandOptionType.Channel,
        channelTypes: [ChannelType.GuildText],
        required: true,
      },
      {
        name: 'phrase',
        description: 'The passphrase users must type to gain access',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
      {
        name: 'role',
        description: 'Role to grant when the correct phrase is typed',
        type: ApplicationCommandOptionType.Role,
        required: true,
      },
    ],
  },
  {
    name: 'verification-history',
    description: 'DM you a table of the last 1000 verification attempts in this server',
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
  },
] as const;

client.once('ready', async () => {
  console.log(`[Bot] Logged in as ${client.user?.tag}`);

  // Clear any previously registered global commands to avoid duplicates
  await client.application!.commands.set([]);

  // Register per-guild for instant availability (no propagation delay)
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(COMMANDS);
  }
  console.log(`[Bot] Commands registered to ${client.guilds.cache.size} guild(s).`);
});

client.on('guildCreate', async (guild) => {
  await guild.commands.set(COMMANDS);
  console.log(`[Bot] Joined guild ${guild.name} — commands registered.`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand() || !interaction.guildId) return;

  const guildId = interaction.guildId;

  const isOwner = interaction.user.id === interaction.guild?.ownerId;

  if (interaction.commandName === 'setup-support-access') {
    if (!isOwner) {
      await interaction.reply({ content: 'Only the server owner can use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    const channel = interaction.options.getChannel('channel', true);
    const phrase  = interaction.options.getString('phrase', true);
    const role    = interaction.options.getRole('role', true);

    setSetting(guildId, 'support_channel_id', channel.id);
    setSetting(guildId, 'support_phrase', phrase);
    setSetting(guildId, 'support_role_id', role.id);

    console.log(`[verification][${guildId}] Configured — channel: ${channel.id}, role: ${role.id}`);
    await interaction.reply({
      content: `Support access gate configured in <#${channel.id}>. Users who type the correct phrase will receive <@&${role.id}>.`,
      flags: MessageFlags.Ephemeral,
    });
  }

  if (interaction.commandName === 'verification-history') {
    if (!isOwner) {
      await interaction.reply({ content: 'Only the server owner can use this command.', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const log = getVerificationLog(guildId);
    if (log.length === 0) {
      await interaction.editReply('No verification attempts recorded yet.');
      return;
    }

    const COL_NUM  = 5;
    const COL_USER = 32;
    const COL_MSG  = 40;
    const COL_TIME = 24;
    const COL_RES  = 8;

    const pad = (s: string, n: number) => s.slice(0, n).padEnd(n);
    const header  = pad('#', COL_NUM) + pad('User', COL_USER) + pad('Message', COL_MSG) + pad('Timestamp', COL_TIME) + pad('Result', COL_RES);
    const divider = '-'.repeat(COL_NUM + COL_USER + COL_MSG + COL_TIME + COL_RES);
    const rows    = log.map((e, i) =>
      pad(String(i + 1), COL_NUM) +
      pad(e.username, COL_USER) +
      pad(e.content, COL_MSG) +
      pad(e.timestamp, COL_TIME) +
      pad(e.success ? 'PASS' : 'FAIL', COL_RES)
    );

    const table = '```\n' + header + '\n' + divider + '\n' + rows.join('\n') + '\n```';

    try {
      await interaction.user.send(`**Verification Attempts — ${interaction.guild?.name} (${log.length})**\n${table}`);
      await interaction.editReply('Verification history sent to your DMs.');
    } catch {
      await interaction.editReply('Could not send DM — please check your privacy settings.');
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild || !message.guildId) return;

  const guildId   = message.guildId;
  const channelId = getSetting(guildId, 'support_channel_id');
  const phrase    = getSetting(guildId, 'support_phrase');
  const roleId    = getSetting(guildId, 'support_role_id');
  if (!channelId || !phrase || !roleId || message.channel.id !== channelId) return;

  await message.delete().catch((err: any) => {
    if (err?.code === 50013) {
      console.warn(`[verification][${guildId}] Cannot delete messages — grant the bot "Manage Messages" permission in the channel`);
    } else {
      console.warn(`[verification][${guildId}] Failed to delete message:`, err.message);
    }
  });

  const phraseMatch = message.content.trim().toLowerCase() === phrase.toLowerCase();
  logVerificationAttempt(guildId, message.author.id, message.author.username, message.content.trim(), phraseMatch);

  if (!phraseMatch) return;

  const member = await message.guild.members.fetch(message.author.id).catch(() => null);
  if (!member) {
    console.error(`[verification][${guildId}] Could not fetch member for ${message.author.username}`);
    return;
  }

  if (member.roles.cache.has(roleId)) {
    console.log(`[verification][${guildId}] ${member.user.username} already has role ${roleId}, skipping`);
    return;
  }

  try {
    await member.roles.add(roleId);
    console.log(`[verification][${guildId}] Granted role ${roleId} to ${member.user.username}`);
    const confirmation = await message.channel.send(`Welcome <@${member.id}>! You now have access to support.`);
    setTimeout(() => confirmation.delete().catch(() => {}), 5000);
  } catch (err: any) {
    console.error(`[verification][${guildId}] Failed to grant role to ${member.user.username}:`, err);
    await message.author.send('Verification failed — please contact an admin to have your role assigned manually.').catch(() => {});
  }
});

client.login(DISCORD_TOKEN);
