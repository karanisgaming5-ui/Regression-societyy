import { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../../services/config/guildConfig.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { botHasPermission } from '../../utils/permissionGuard.js';

const DEFAULTS = { enabled: false, channelId: null, threshold: 3, emoji: '⭐', selfStar: false, ignoreBots: true };

export default {
  data: new SlashCommandBuilder()
    .setName('starboard')
    .setDescription('Configure and inspect the server starboard')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand(s => s.setName('setup').setDescription('Enable or update the starboard')
      .addChannelOption(o => o.setName('channel').setDescription('Channel where starred messages are posted').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addIntegerOption(o => o.setName('threshold').setDescription('Stars required to feature a message').setMinValue(1).setMaxValue(50).setRequired(true))
      .addStringOption(o => o.setName('emoji').setDescription('Reaction emoji to count (default ⭐)').setMaxLength(32))
      .addBooleanOption(o => o.setName('allow_self_star').setDescription('Count the message author’s own reaction'))
      .addBooleanOption(o => o.setName('ignore_bots').setDescription('Ignore messages written by bots')))
    .addSubcommand(s => s.setName('disable').setDescription('Disable the starboard'))
    .addSubcommand(s => s.setName('status').setDescription('Show the current starboard settings'))
    .addSubcommand(s => s.setName('ignore').setDescription('Exclude a channel from the starboard')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to exclude').addChannelTypes(ChannelType.GuildText).setRequired(true)))
    .addSubcommand(s => s.setName('unignore').setDescription('Allow a channel on the starboard again')
      .addChannelOption(o => o.setName('channel').setDescription('Channel to include again').addChannelTypes(ChannelType.GuildText).setRequired(true))),
  category: 'Server Management',
  async execute(interaction, _config, client) {
    await InteractionHelper.safeDefer(interaction, { ephemeral: true });
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild) && interaction.guild.ownerId !== interaction.user.id) {
      return InteractionHelper.safeEditReply(interaction, { content: 'You need **Manage Server** permission to configure the starboard.' });
    }
    const guildConfig = await getGuildConfig(client, interaction.guildId);
    const current = { ...DEFAULTS, ...(guildConfig.starboard || {}) };
    const action = interaction.options.getSubcommand();
    if (action === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const threshold = interaction.options.getInteger('threshold');
      const emoji = interaction.options.getString('emoji') || '⭐';
      const allowSelfStar = interaction.options.getBoolean('allow_self_star');
      const ignoreBots = interaction.options.getBoolean('ignore_bots');
      if (!botHasPermission(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks'])) {
        return InteractionHelper.safeEditReply(interaction, { content: `I need View Channel, Send Messages and Embed Links permissions in ${channel}.` });
      }
      guildConfig.starboard = { ...current, enabled: true, channelId: channel.id, threshold, emoji, selfStar: allowSelfStar ?? current.selfStar, ignoreBots: ignoreBots ?? current.ignoreBots };
      await setGuildConfig(client, interaction.guildId, guildConfig);
      return InteractionHelper.safeEditReply(interaction, { embeds: [new EmbedBuilder().setColor(0xF1C40F).setTitle('⭐ Starboard enabled').setDescription(`Starboard channel: ${channel}\nThreshold: **${threshold} ${emoji}**\nNew qualifying messages will be featured automatically.`)] });
    }
    if (action === 'ignore' || action === 'unignore') {
      const channel = interaction.options.getChannel('channel');
      const ignoredChannels = new Set(current.ignoredChannels || []);
      if (action === 'ignore') ignoredChannels.add(channel.id); else ignoredChannels.delete(channel.id);
      guildConfig.starboard = { ...current, ignoredChannels: [...ignoredChannels] };
      await setGuildConfig(client, interaction.guildId, guildConfig);
      return InteractionHelper.safeEditReply(interaction, { content: action === 'ignore' ? `${channel} will no longer be featured.` : `${channel} can be featured again.` });
    }
    if (action === 'disable') {
      guildConfig.starboard = { ...current, enabled: false };
      await setGuildConfig(client, interaction.guildId, guildConfig);
      return InteractionHelper.safeEditReply(interaction, { content: 'Starboard has been disabled. Existing featured messages are left in place.' });
    }
    return InteractionHelper.safeEditReply(interaction, { embeds: [new EmbedBuilder().setColor(current.enabled ? 0x2ECC71 : 0x95A5A6).setTitle('⭐ Starboard settings').addFields(
      { name: 'Status', value: current.enabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Channel', value: current.channelId ? `<#${current.channelId}>` : 'Not set', inline: true },
      { name: 'Threshold', value: `${current.threshold} ${current.emoji}`, inline: true },
      { name: 'Self-star', value: current.selfStar ? 'Allowed' : 'Not allowed', inline: true },
      { name: 'Ignore bots', value: current.ignoreBots ? 'Yes' : 'No', inline: true },
      { name: 'Ignored channels', value: `${(current.ignoredChannels || []).length}`, inline: true },
    )] });
  }
};
