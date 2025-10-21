/**
 * Setup Script
 *
 * Vérifie que l'environnement est correctement configuré avant de démarrer le serveur.
 * Tests:
 * - Variables d'environnement requises
 * - Connexion à WordPress API
 * - Connexion Redis (optionnelle)
 *
 * @package WordPress_Claude_Agent
 */

import dotenv from 'dotenv';
import axios from 'axios';
import { createClient } from 'redis';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: resolve(__dirname, '../.env') });

// Codes couleur pour la console
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
};

/**
 * Affiche un message de succès
 */
function success(message) {
	console.log(`${colors.green}✓${colors.reset} ${message}`);
}

/**
 * Affiche un message d'erreur
 */
function error(message) {
	console.log(`${colors.red}✗${colors.reset} ${message}`);
}

/**
 * Affiche un message d'avertissement
 */
function warning(message) {
	console.log(`${colors.yellow}⚠${colors.reset} ${message}`);
}

/**
 * Affiche une section
 */
function section(title) {
	console.log(`\n${colors.cyan}${title}${colors.reset}`);
	console.log('='.repeat(50));
}

/**
 * Vérifie les variables d'environnement
 */
function checkEnvironmentVariables() {
	section('Checking Environment Variables');

	const required = [
		'WORDPRESS_URL',
		'WORDPRESS_USER',
		'WORDPRESS_APP_PASSWORD',
		'ANTHROPIC_API_KEY',
	];

	const optional = [
		'REDIS_URL',
		'REDIS_ENABLED',
		'PORT',
		'NODE_ENV',
		'LOG_LEVEL',
		'CACHE_TTL',
		'HEADLESS',
	];

	let allValid = true;

	// Vérifier les variables requises
	for (const varName of required) {
		if (process.env[varName]) {
			const displayValue = varName.includes('PASSWORD') || varName.includes('KEY')
				? '***' + process.env[varName].slice(-4)
				: process.env[varName];
			success(`${varName} = ${displayValue}`);
		} else {
			error(`${varName} is missing`);
			allValid = false;
		}
	}

	// Vérifier les variables optionnelles
	console.log('\nOptional variables:');
	for (const varName of optional) {
		if (process.env[varName]) {
			success(`${varName} = ${process.env[varName]}`);
		} else {
			warning(`${varName} not set (using default)`);
		}
	}

	return allValid;
}

/**
 * Teste la connexion à WordPress
 */
async function testWordPressConnection() {
	section('Testing WordPress Connection');

	try {
		const url = process.env.WORDPRESS_URL.replace(/\/$/, '');
		const endpoint = `${url}/wp-json/claude-agent/v1/system/info`;

		console.log(`Connecting to: ${endpoint}`);

		const response = await axios.get(endpoint, {
			auth: {
				username: process.env.WORDPRESS_USER,
				password: process.env.WORDPRESS_APP_PASSWORD,
			},
			timeout: 10000,
		});

		if (response.data) {
			success(`WordPress connection successful`);
			console.log(`  - WordPress version: ${response.data.wp_version}`);
			console.log(`  - Plugin version: ${response.data.plugin_version}`);
			console.log(`  - Active plugins: ${response.data.active_integrations?.length || 0}`);
			console.log(`  - Available blocks: ${response.data.blocks_count || 'N/A'}`);
			return true;
		}
	} catch (err) {
		error(`WordPress connection failed: ${err.message}`);
		if (err.response) {
			console.log(`  Status: ${err.response.status}`);
			console.log(`  Message: ${err.response.data?.message || 'Unknown error'}`);
		}
		return false;
	}
}

/**
 * Teste la connexion Redis
 */
async function testRedisConnection() {
	section('Testing Redis Connection');

	if (process.env.REDIS_ENABLED !== 'true') {
		warning('Redis is disabled (REDIS_ENABLED=false)');
		return true;
	}

	try {
		const client = createClient({
			url: process.env.REDIS_URL || 'redis://localhost:6379',
		});

		client.on('error', (err) => {
			// Géré dans le catch
		});

		await client.connect();

		// Tester ping
		const pong = await client.ping();

		if (pong === 'PONG') {
			success('Redis connection successful');

			// Tester set/get
			await client.set('test:setup', 'ok');
			const value = await client.get('test:setup');

			if (value === 'ok') {
				success('Redis read/write operations working');
				await client.del('test:setup');
			}
		}

		await client.disconnect();
		return true;
	} catch (err) {
		error(`Redis connection failed: ${err.message}`);
		warning('Redis is optional. Server will work without it (no caching)');
		return true; // Non bloquant
	}
}

/**
 * Affiche le résumé de la configuration
 */
function printSummary(envValid, wpValid, redisValid) {
	section('Configuration Summary');

	console.log(`Environment Variables: ${envValid ? colors.green + 'VALID' : colors.red + 'INVALID'}${colors.reset}`);
	console.log(`WordPress Connection:  ${wpValid ? colors.green + 'VALID' : colors.red + 'INVALID'}${colors.reset}`);
	console.log(`Redis Connection:      ${redisValid ? colors.green + 'VALID' : colors.yellow + 'OPTIONAL'}${colors.reset}`);

	console.log('\n' + '='.repeat(50));

	if (envValid && wpValid) {
		console.log(`${colors.green}✓ Server is ready to start!${colors.reset}`);
		console.log(`\nRun: ${colors.blue}npm start${colors.reset}`);
		console.log(`Or:  ${colors.blue}npm run dev${colors.reset} (with auto-reload)\n`);
		return 0;
	} else {
		console.log(`${colors.red}✗ Configuration issues detected${colors.reset}`);
		console.log(`\nPlease fix the errors above before starting the server.\n`);
		return 1;
	}
}

/**
 * Main function
 */
async function main() {
	console.log(`${colors.blue}
╔═══════════════════════════════════════════════════╗
║   WordPress Claude Agent - Setup Verification    ║
╚═══════════════════════════════════════════════════╝
${colors.reset}`);

	const envValid = checkEnvironmentVariables();
	const wpValid = await testWordPressConnection();
	const redisValid = await testRedisConnection();

	const exitCode = printSummary(envValid, wpValid, redisValid);
	process.exit(exitCode);
}

// Exécuter
main().catch((err) => {
	console.error(`${colors.red}Fatal error:${colors.reset}`, err);
	process.exit(1);
});
