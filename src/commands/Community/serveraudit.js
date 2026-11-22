import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    category: 'Community',
    data: new SlashCommandBuilder()
        .setName('serveraudit')
        .setDescription('Get a practical overview of server configuration and security')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .setDMPermission(false),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        await guild.fetch();
        const everyone = guild.roles.everyone;
        const everyoneAdmin = everyone.permissions.has(PermissionFlagsBits.Administrator);
        const everyoneMention = everyone.permissions.has(PermissionFlagsBits.MentionEveryone);
        const textChannels = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement).size;
        const voiceChannels = guild.channels.cache.filter((channel) => [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)).size;
        const categories = guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildCategory).size;
        const botMember = await guild.members.fetchMe().catch(() => null);
        const findings = [];
        if (everyoneAdmin) findings.push('🔴 @everyone has Administrator permission. Remove it unless absolutely required.');
        if (everyoneMention) findings.push('🟠 @everyone can mention everyone and here.');
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageGuild)) findings.push('🟠 The bot lacks Manage Server; some configuration commands may not work.');
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageRoles)) findings.push('🟠 The bot lacks Manage Roles; autoroles and role management may fail.');
        if (!botMember?.permissions.has(PermissionFlagsBits.ManageMessages)) findings.push('🟠 The bot lacks Manage Messages; moderation cleanup may fail.');
        if (!findings.length) findings.push('🟢 No obvious @everyone permission risks or missing core bot permissions were detected.');

        const embed = new EmbedBuilder()
            .setColor(everyoneAdmin ? 0xed4245 : 0x5865f2)
            .setTitle(`Server audit • ${guild.name}`)
            .addFields(
                { name: 'Server overview', value: [`**Owner:** <@${guild.ownerId}>`, `**Members:** ${guild.memberCount.toLocaleString()}`, `**Roles:** ${guild.roles.cache.size}`, `**Channels:** ${guild.channels.cache.size} (${textChannels} text, ${voiceChannels} voice, ${categories} categories)`, `**Boosts:** ${guild.premiumSubscriptionCount || 0} • Level ${guild.premiumTier}`].join('\n'), inline: false },
                { name: 'Security & bot checks', value: findings.join('\n'), inline: false },
                { name: 'Server settings', value: [`**Verification:** ${String(guild.verificationLevel)}`, `**Explicit content filter:** ${String(guild.explicitContentFilter)}`, `**2FA moderation requirement:** ${guild.mfaLevel === 1 ? 'Enabled' : 'Disabled'}`].join('\n'), inline: false },
            )
            .setFooter({ text: 'Regression Society • Informational audit; review findings before changing permissions' })
            .setTimestamp();
        const iconUrl = guild.iconURL({ size: 256 });
        if (iconUrl) embed.setThumbnail(iconUrl);
        await interaction.editReply({ embeds: [embed] });
    },
};
