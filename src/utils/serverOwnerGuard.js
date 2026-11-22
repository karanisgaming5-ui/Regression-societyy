/**
 * Server-owner-only guard for sensitive server-wide controls.
 * Never use Administrator/ManageGuild here: only Guild.ownerId is accepted.
 */
export function isServerOwner(interaction) {
  return Boolean(interaction?.guild && interaction?.user?.id && interaction.guild.ownerId === interaction.user.id);
}

export async function requireServerOwner(interaction, { ephemeral = true } = {}) {
  if (isServerOwner(interaction)) return true;
  const payload = {
    content: '🔒 Only the **server owner** can change XP, levels, or leveling-system settings. Administrator permissions do not override this restriction.',
    ...(ephemeral ? { ephemeral: true } : {}),
  };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch { /* interaction may have expired */ }
  return false;
}
