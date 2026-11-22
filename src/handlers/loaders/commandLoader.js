import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { Collection } from 'discord.js';
import { logger } from '../../utils/logger.js';
import botConfig from '../../config/bot.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MAX_COMMANDS = 100;
const COMMAND_COUNT_WARN_THRESHOLD = 90;
const MAX_DESCRIPTION_LENGTH = 100;
const MAX_OPTION_NAME_LENGTH = 32;
const MAX_CHOICE_NAME_LENGTH = 100;
const MAX_CHOICE_VALUE_LENGTH = 100;

function getSubcommandInfo(commandData) {
    const subcommands = [];
    
    if (commandData.options) {
        for (const option of commandData.options) {
if (option.type === 1) {
                subcommands.push(option.name);
} else if (option.type === 2) {
                if (option.options) {
                    for (const subOption of option.options) {
if (subOption.type === 1) {
                            subcommands.push(`${option.name}/${subOption.name}`);
                        }
                    }
                }
            }
        }
    }
    
    return subcommands;
}

async function getAllFiles(directory, fileList = []) {
    const files = await fs.readdir(directory, { withFileTypes: true });
    
    for (const file of files) {
        const filePath = path.join(directory, file.name);
        
        if (file.isDirectory()) {
            if (file.name === 'modules') {
                continue;
            }
            await getAllFiles(filePath, fileList);
        } else if (file.name.endsWith('.js')) {
            fileList.push(filePath);
        }
    }
    
    return fileList;
}

export async function loadCommands(client) {
    client.commands = new Collection();
    const commandsPath = path.join(__dirname, '../../commands');
    const commandFiles = await getAllFiles(commandsPath);
    
    logger.info(`Found ${commandFiles.length} command files to load`);
    
    const uniqueCommandNames = new Set();
    const duplicateCommandNames = [];
    const loadErrors = [];
    
    for (const filePath of commandFiles) {
        try {
            const normalizedPath = filePath.replace(/\\/g, '/');
            
            const commandName = path.basename(filePath, '.js');
            const commandDir = path.dirname(filePath);
            const category = path.basename(commandDir);
            
            const commandModule = await import(pathToFileURL(filePath).href);
            const command = commandModule.default || commandModule;
            
            if (!command.data || typeof command.data.toJSON !== 'function' || typeof command.execute !== 'function' || !command.data.name) {
                const reason = `Command at ${filePath} is missing a valid data builder, name, or execute function.`;
                logger.error(reason);
                loadErrors.push(reason);
                continue;
            }
            
            command.category = category;
            command.filePath = normalizedPath;
            
            const primaryCommandName = command.data.name;
            
            if (uniqueCommandNames.has(primaryCommandName)) {
                duplicateCommandNames.push(`${primaryCommandName} (${normalizedPath})`);
                logger.error(`Duplicate top-level command name \"${primaryCommandName}\" found in ${normalizedPath}`);
                continue;
            }
            uniqueCommandNames.add(primaryCommandName);
            client.commands.set(primaryCommandName, command);

            const subcommands = getSubcommandInfo(command.data.toJSON());
            
            logger.info(`Loaded command: ${primaryCommandName} from ${normalizedPath} (category: ${category})`);
            
            if (subcommands.length > 0) {
                logger.info(`  - Subcommands: ${subcommands.join(', ')}`);
            }
            
        } catch (error) {
            logger.error(`Error loading command from ${filePath}:`, error);
        }
    }
    
    if (duplicateCommandNames.length > 0) {
        throw new Error(`Duplicate top-level command names detected: ${duplicateCommandNames.join(', ')}`);
    }

    const commandsWithSubcommands = Array.from(client.commands.values()).filter(cmd => {
        const subcommands = getSubcommandInfo(cmd.data.toJSON());
        return subcommands.length > 0;
    });
    
    const totalSubcommands = commandsWithSubcommands.reduce((total, cmd) => {
        return total + getSubcommandInfo(cmd.data.toJSON()).length;
    }, 0);
    
    const uniqueCommands = new Set();
    for (const [name, command] of client.commands.entries()) {
        if (command.data && command.data.name) {
            uniqueCommands.add(command.data.name);
        }
    }
    
    if (uniqueCommands.size > MAX_COMMANDS) {
        throw new Error(`Loaded ${uniqueCommands.size} top-level commands, exceeding Discord's ${MAX_COMMANDS}-command limit.`);
    }
    const headroom = MAX_COMMANDS - uniqueCommands.size;
    logger.info(`Loaded ${uniqueCommands.size}/${MAX_COMMANDS} top-level commands (${headroom} slots remaining)`);
    if (uniqueCommands.size >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(`Command registry is near Discord's limit: ${uniqueCommands.size}/${MAX_COMMANDS}`);
    }
    return client.commands;
}

function collectCommandPayloads(client) {
    const commands = [];
    let totalSubcommands = 0;
    const registeredNames = new Set();

    for (const command of client.commands.values()) {
        if (!command.data || typeof command.data.toJSON !== 'function') {
            logger.warn(`Command missing data or toJSON method: ${command}`);
            continue;
        }

        const commandName = command.data.name;
        logger.debug(`Processing command for registration: ${commandName}`);

        if (registeredNames.has(commandName)) {
            logger.debug(`Skipping duplicate command: ${commandName}`);
            continue;
        }

        registeredNames.add(commandName);
        const commandJson = command.data.toJSON();
        commands.push(commandJson);
        totalSubcommands += getSubcommandInfo(commandJson).length;

        if (process.env.NODE_ENV !== 'production') {
            logger.debug(`Registering command: ${commandName}`);
        }
    }

    return { commands, totalSubcommands };
}

function validateCommands(commands) {
    const validationErrors = [];

    for (const cmd of commands) {
        if (cmd.name && cmd.name.length > 32) {
            validationErrors.push(`Command ${cmd.name} has name longer than 32 chars: "${cmd.name}" (${cmd.name.length} chars)`);
        }
        if (cmd.description && cmd.description.length > MAX_DESCRIPTION_LENGTH) {
            validationErrors.push(`Command ${cmd.name} description exceeds Discord's ${MAX_DESCRIPTION_LENGTH}-character limit (${cmd.description.length} chars)`);
        }

        if (!cmd.options) {
            continue;
        }

        for (const option of cmd.options) {
            if (option.name && option.name.length > MAX_OPTION_NAME_LENGTH) {
                validationErrors.push(`Command ${cmd.name} option ${option.name} has name longer than 32 chars: "${option.name}" (${option.name.length} chars)`);
            }
            if (option.description && option.description.length > MAX_DESCRIPTION_LENGTH) {
                validationErrors.push(`Command ${cmd.name} option ${option.name} description exceeds Discord's ${MAX_DESCRIPTION_LENGTH}-character limit (${option.description.length} chars)`);
            }

            if (option.choices) {
                for (const choice of option.choices) {
                    if (choice.name && choice.name.length > MAX_CHOICE_NAME_LENGTH) {
                        validationErrors.push(`Command ${cmd.name} option ${option.name} choice name exceeds Discord's ${MAX_CHOICE_NAME_LENGTH}-character limit (${choice.name.length} chars)`);
                    }
                    if (choice.value !== undefined && String(choice.value).length > MAX_CHOICE_VALUE_LENGTH) {
                        validationErrors.push(`Command ${cmd.name} option ${option.name} choice value exceeds Discord's ${MAX_CHOICE_VALUE_LENGTH}-character limit (${String(choice.value).length} chars)`);
                    }
                }
            }

            if (!option.options) {
                continue;
            }

            for (const subOption of option.options) {
                if (subOption.name && subOption.name.length > MAX_OPTION_NAME_LENGTH) {
                    validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} has name longer than 32 chars: "${subOption.name}" (${subOption.name.length} chars)`);
                }
                if (subOption.description && subOption.description.length > MAX_DESCRIPTION_LENGTH) {
                    validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} description exceeds Discord's ${MAX_DESCRIPTION_LENGTH}-character limit (${subOption.description.length} chars)`);
                }

                if (!subOption.choices) {
                    continue;
                }

                for (const choice of subOption.choices) {
                    if (choice.name && choice.name.length > MAX_CHOICE_NAME_LENGTH) {
                        validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice name exceeds Discord's ${MAX_CHOICE_NAME_LENGTH}-character limit (${choice.name.length} chars)`);
                    }
                    if (choice.value !== undefined && String(choice.value).length > MAX_CHOICE_VALUE_LENGTH) {
                        validationErrors.push(`Command ${cmd.name} subcommand ${option.name} option ${subOption.name} choice value exceeds Discord's ${MAX_CHOICE_VALUE_LENGTH}-character limit (${String(choice.value).length} chars)`);
                    }
                }
            }
        }
    }

    if (validationErrors.length > 0) {
        logger.error('Command validation failed. Errors:');
        validationErrors.forEach((error) => logger.error(`  - ${error}`));
        throw new Error(`Command validation failed with ${validationErrors.length} errors`);
    }
}

function prepareCommandsForRegistration(commands) {
    if (commands.length >= COMMAND_COUNT_WARN_THRESHOLD) {
        logger.warn(`Command count (${commands.length}) is near Discord's ${MAX_COMMANDS} global command limit`);
    }

    if (commands.length <= MAX_COMMANDS) {
        return commands;
    }

    throw new Error(`Cannot register ${commands.length} application commands: Discord allows at most ${MAX_COMMANDS}. Remove or consolidate commands instead of silently omitting features.`);
}

async function registerGlobalCommands(client, clientId, commands, totalSubcommands) {
    if (!clientId) {
        throw new Error('CLIENT_ID is required for slash command registration');
    }

    if (!client.rest) {
        throw new Error('Discord REST client is not available for slash command registration');
    }

    if (commands.length === 0) {
        throw new Error('No valid slash commands were loaded; refusing to overwrite the Discord command list with an empty payload.');
    }

    logger.info(`Preparing to register ${commands.length} top-level commands (${totalSubcommands} subcommands) globally`);
    logger.info('Validating commands before registration...');
    validateCommands(commands);
    logger.info('Command validation passed');

    const commandsToRegister = prepareCommandsForRegistration(commands);

    if (botConfig.commands?.deleteCommands) {
        logger.info('Clearing existing global commands before registration...');
        await client.rest.put(`/applications/${clientId}/commands`, { body: [] });
    }

    logger.info(`Registering ${commandsToRegister.length} global commands...`);
    logger.info(`Command names: ${commandsToRegister.map(command => command.name).join(', ')}`);
    try {
        const registered = await client.rest.put(`/applications/${clientId}/commands`, { body: commandsToRegister });
        logger.info(`Successfully registered ${Array.isArray(registered) ? registered.length : commandsToRegister.length} global commands`);
        logger.info('Global command updates can take up to an hour to propagate to every server.');
    } catch (error) {
        const apiMessage = error?.rawError?.message || error?.message || 'Unknown Discord API error';
        const apiCode = error?.rawError?.code ?? error?.code ?? 'unknown';
        logger.error(`Discord rejected global slash-command registration (code ${apiCode}): ${apiMessage}`);
        if (error?.rawError?.errors) {
            logger.error(`Discord validation details: ${JSON.stringify(error.rawError.errors)}`);
        }
        throw error;
    }
}

export async function registerCommands(client, options = {}) {
    const { clientId = null } = options;

    try {
        const { commands, totalSubcommands } = collectCommandPayloads(client);
        await registerGlobalCommands(client, clientId, commands, totalSubcommands);
    } catch (error) {
        logger.error('Error registering commands:', error);
        throw error;
    }
}

export async function reloadCommand(client, commandName) {
    const command = client.commands.get(commandName);
    
    if (!command) {
        return { success: false, message: `Command "${commandName}" not found` };
    }
    
    try {
        const commandPath = path.resolve(command.filePath);
        const moduleUrl = pathToFileURL(commandPath);
        moduleUrl.searchParams.set('t', Date.now().toString());

        const newCommand = (await import(moduleUrl.href)).default;
        
        client.commands.set(commandName, newCommand);
        
        logger.info(`Reloaded command: ${commandName}`);
        return { success: true, message: `Successfully reloaded command "${commandName}"` };
    } catch (error) {
        logger.error(`Error reloading command "${commandName}":`, error);
        return { success: false, message: `Error reloading command: ${error.message}` };
    }
}