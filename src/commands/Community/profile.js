import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { getUserLevelData, getLeaderboard } from '../../services/leveling/leveling.js';
import { getXpForLevel } from '../../services/leveling/xpSystem.js';

export default {
  category: 'Community',
  data: new SlashCommandBuilder()
    .setName('profile')
    .setDescription('View a member profile, level progress and reputation')
    .setDMPermission(false)
    .addUserOption(o => o.setName('user').setDescription('Member to view')),
  async execute(interaction, _config, client) {
    const target = interaction.options.getUser('user') || interaction.user;
    if (target.bot) return interaction.reply({ content: 'Bot accounts do not have member profiles.', ephemeral: true });
    await interaction.deferReply();
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (!member) return interaction.reply({ content: 'That member is no longer in this server.', ephemeral: true });
    const [level, rep, leaderboard] = await Promise.all([
      getUserLevelData(client, interaction.guildId, target.id).catch(() => ({ level: 0, xp: 0, totalXp: 0, lastMessage: 0 })),
      client.db.get(`guild:${interaction.guildId}:rep:user:${target.id}`, { score: 0, received: 0, given: 0 }),
      getLeaderboard(client, interaction.guildId, 100).catch(() => [])
    ]);
    const score = Number(rep?.score || 0);
    const needed = Math.max(1, getXpForLevel(Number(level.level || 0)));
    const current = Math.max(0, Number(level.xp || 0));
    const pct = Math.min(100, Math.floor(current / needed * 100));
    const bar = '▰'.repeat(Math.floor(pct / 10)) + '▱'.repeat(10 - Math.floor(pct / 10));
    const rankIndex = leaderboard.findIndex(entry => entry.userId === target.id);
    const serverRank = rankIndex >= 0 ? `#${rankIndex + 1}` : (Number(level.totalXp || 0) > 0 ? 'Outside top 100' : 'Unranked');
    const milestones = [
      Number(level.level || 0) >= 100 ? '💠 Centurion' : null,
      Number(level.level || 0) >= 50 ? '🏆 Veteran' : null,
      Number(level.level || 0) >= 25 ? '🔥 Dedicated' : null,
      Number(level.level || 0) >= 10 ? '⭐ Regular' : null,
      Number(level.level || 0) < 10 ? '🌱 Rising member' : null
    ].filter(Boolean).join(' · ');
    const embed = new EmbedBuilder()
      .setColor(0x5865F2).setAuthor({ name: `${target.username}'s profile`, iconURL: target.displayAvatarURL() })
      .setThumbnail(target.displayAvatarURL({ size: 512 }))
      .setDescription(`**${member.displayName}**\n${member.roles.highest.id !== interaction.guild.id ? member.roles.highest.toString() : 'Community member'}`)
      .addFields(
        { name: 'Level', value: `**${level.level || 0}**`, inline: true },
        { name: 'Server rank', value: `**${serverRank}**`, inline: true },
        { name: 'Reputation', value: `**${score.toLocaleString()}**`, inline: true },
        { name: 'Total XP', value: `**${Number(level.totalXp || 0).toLocaleString()}**`, inline: true },
        { name: 'Progress', value: `${bar} **${pct}%**\n${current.toLocaleString()} / ${needed.toLocaleString()} XP`, inline: true },
        { name: 'Milestone', value: milestones, inline: true },
        { name: 'Last XP activity', value: level.lastMessage ? `<t:${Math.floor(level.lastMessage/1000)}:R>` : 'No recorded activity', inline: true },
        { name: 'Member since', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp/1000)}:D>` : 'Unknown', inline: true },
        { name: 'Account created', value: `<t:${Math.floor(target.createdTimestamp/1000)}:D>`, inline: true }
      )
      .setFooter({ text: 'Regression Society • Member profile' }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }
};
