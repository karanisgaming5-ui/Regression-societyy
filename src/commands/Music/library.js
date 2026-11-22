import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from 'discord.js';
import { InteractionHelper } from '../../utils/interactionHelper.js';
import { playQuery, replyMusicSuccess } from '../../services/music/musicActions.js';
import {
    clearLibrary,
    getCurrentTrackForLibrary,
    getLibraryPage,
    getLibraryTracks,
    removeLibraryTrack,
    resolveTrackForLibrary,
    saveLibraryTrack,
} from '../../services/music/musicLibrary.js';

function formatDuration(ms) {
    if (!ms) return 'Live / unknown length';
    const seconds = Math.floor(ms / 1000);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function libraryEmbed(title, description) {
    return new EmbedBuilder().setColor(0x5865f2).setTitle(title).setDescription(description).setFooter({ text: 'Regression Society • Personal music library' }).setTimestamp();
}

export default {
    slashOnly: true,
    category: 'Music',
    data: new SlashCommandBuilder()
        .setName('library')
        .setDescription('Save and play songs from your personal music library')
        .addSubcommand((sub) => sub
            .setName('save')
            .setDescription('Save the currently playing song or search for a song to save')
            .addStringOption((opt) => opt.setName('query').setDescription('Song title or artist (leave empty to save the current song)').setMaxLength(200)))
        .addSubcommand((sub) => sub
            .setName('list')
            .setDescription('Browse your saved songs')
            .addIntegerOption((opt) => opt.setName('page').setDescription('Page number').setMinValue(1)))
        .addSubcommand((sub) => sub
            .setName('play')
            .setDescription('Play a song from your saved library')
            .addIntegerOption((opt) => opt.setName('number').setDescription('Song number shown by /library list').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub
            .setName('remove')
            .setDescription('Remove a song from your library')
            .addIntegerOption((opt) => opt.setName('number').setDescription('Song number shown by /library list').setRequired(true).setMinValue(1)))
        .addSubcommand((sub) => sub
            .setName('clear')
            .setDescription('Remove every song from your personal library')
            .addBooleanOption((opt) => opt.setName('confirm').setDescription('Confirm permanent removal of all saved songs').setRequired(true))),

    async execute(interaction, _config, client) {
        await InteractionHelper.safeDefer(interaction, { flags: MessageFlags.Ephemeral });
        const action = interaction.options.getSubcommand();
        const userId = interaction.user.id;

        if (action === 'save') {
            const query = interaction.options.getString('query');
            const track = query
                ? await resolveTrackForLibrary(client, interaction, query)
                : getCurrentTrackForLibrary(client, interaction.guild.id);
            const result = await saveLibraryTrack(client, userId, track);
            const message = result.saved
                ? `Saved **${result.track.title}** — ${result.track.author} to your library.`
                : `**${result.track.title}** is already in your library.`;
            return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed(result.saved ? 'Song saved' : 'Already saved', message)] });
        }

        if (action === 'list') {
            const tracks = await getLibraryTracks(client, userId);
            if (!tracks.length) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Your music library is empty', 'Save the song playing with `/library save`, or search for one with `/library save query:<song>`.')] });
            }
            const page = getLibraryPage(tracks, interaction.options.getInteger('page') || 1, 10);
            const lines = page.items.map((track) => `**${track.number}. ${track.title}** — ${track.author} · ${formatDuration(track.length)}`);
            const embed = libraryEmbed(`Your music library • ${page.total} song(s)`, lines.join('\n'));
            embed.setFooter({ text: `Page ${page.page}/${page.totalPages} • ${page.total} saved songs • No app-imposed song cap` });
            return InteractionHelper.safeEditReply(interaction, { embeds: [embed] });
        }

        if (action === 'play') {
            const number = interaction.options.getInteger('number');
            const tracks = await getLibraryTracks(client, userId);
            const track = tracks[number - 1];
            if (!track) return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Song not found', 'That number is not in your library. Use `/library list` to see the available numbers.')] });
            const result = await playQuery(client, interaction, track.uri || `${track.title} ${track.author}`);
            return replyMusicSuccess(interaction, result.embed);
        }

        if (action === 'remove') {
            const track = await removeLibraryTrack(client, userId, interaction.options.getInteger('number'));
            if (!track) return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Song not found', 'Use `/library list` to check the song numbers.')] });
            return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Song removed', `Removed **${track.title}** — ${track.author} from your library.`)] });
        }

        if (action === 'clear') {
            if (!interaction.options.getBoolean('confirm')) {
                return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Confirmation required', 'Run `/library clear confirm:true` to permanently remove your saved songs.')] });
            }
            const count = await clearLibrary(client, userId);
            return InteractionHelper.safeEditReply(interaction, { embeds: [libraryEmbed('Library cleared', `Removed ${count} saved song(s) from your library.`)] });
        }
    },
};
