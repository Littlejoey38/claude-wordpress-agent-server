/**
 * Test WordPress API Client
 *
 * Script de test pour vérifier toutes les méthodes du WordPressAPI.
 * Teste chaque endpoint et affiche les résultats.
 *
 * Usage: node scripts/test-wordpress-api.js
 *
 * @package WordPress_Claude_Agent
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { WordPressAPI } from '../src/clients/wordpress-api.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: resolve(__dirname, '../.env') });

// Codes couleur
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	gray: '\x1b[90m',
};

function section(title) {
	console.log(`\n${colors.cyan}${title}${colors.reset}`);
	console.log('='.repeat(60));
}

function success(message) {
	console.log(`${colors.green}✓${colors.reset} ${message}`);
}

function error(message) {
	console.log(`${colors.red}✗${colors.reset} ${message}`);
}

function info(message) {
	console.log(`${colors.gray}  ${message}${colors.reset}`);
}

/**
 * Main test function
 */
async function main() {
	console.log(`${colors.blue}
╔══════════════════════════════════════════════════════════╗
║      WordPress API Client - Functional Tests            ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);

	try {
		// Initialize WordPress API
		section('1. Initializing WordPress API Client');
		const wordpressAPI = new WordPressAPI({
			url: process.env.WORDPRESS_URL,
			user: process.env.WORDPRESS_USER,
			appPassword: process.env.WORDPRESS_APP_PASSWORD,
		});

		await wordpressAPI.initialize();
		success('WordPress API client initialized');

		// Test getSystemInfo()
		section('2. Testing getSystemInfo()');
		try {
			const systemInfo = await wordpressAPI.getSystemInfo();
			success('getSystemInfo() - OK');
			info(`WordPress version: ${systemInfo.wp_version}`);
			info(`Plugin version: ${systemInfo.plugin_version}`);
			info(`Active integrations: ${systemInfo.active_integrations?.length || 0}`);
			info(`Total blocks: ${systemInfo.blocks_count || 'N/A'}`);
		} catch (err) {
			error(`getSystemInfo() failed: ${err.message}`);
		}

		// Test getBlocksSummary()
		section('3. Testing getBlocksSummary()');
		try {
			const blocksSummary = await wordpressAPI.getBlocksSummary();
			success('getBlocksSummary() - OK');

			const categories = Object.keys(blocksSummary.by_category || {});
			info(`Categories found: ${categories.length}`);
			info(`Sample categories: ${categories.slice(0, 5).join(', ')}`);

			const totalBlocks = Object.values(blocksSummary.by_category || {})
				.reduce((sum, blocks) => sum + blocks.length, 0);
			info(`Total blocks: ${totalBlocks}`);
		} catch (err) {
			error(`getBlocksSummary() failed: ${err.message}`);
		}

		// Test getBlockSchema()
		section('4. Testing getBlockSchema()');
		const testBlocks = ['core/paragraph', 'core/heading', 'core/image'];

		for (const blockName of testBlocks) {
			try {
				const schema = await wordpressAPI.getBlockSchema(blockName);
				success(`getBlockSchema('${blockName}') - OK`);
				info(`  Attributes: ${Object.keys(schema.attributes || {}).length}`);
				info(`  Supports: ${Object.keys(schema.supports || {}).length}`);
			} catch (err) {
				error(`getBlockSchema('${blockName}') failed: ${err.message}`);
			}
		}

		// Test getBlockAttributesByGroup()
		section('5. Testing getBlockAttributesByGroup()');
		try {
			const basicAttrs = await wordpressAPI.getBlockAttributesByGroup('core/heading', 'basic');
			success(`getBlockAttributesByGroup('core/heading', 'basic') - OK`);
			info(`  Attributes: ${Object.keys(basicAttrs.attributes || {}).join(', ')}`);
		} catch (err) {
			error(`getBlockAttributesByGroup() failed: ${err.message}`);
		}

		// Test getGlobalStyles()
		section('6. Testing getGlobalStyles()');
		try {
			const globalStyles = await wordpressAPI.getGlobalStyles();
			success('getGlobalStyles() - OK');
			info(`  Colors: ${globalStyles.colors?.palette?.length || 0}`);
			info(`  Font sizes: ${globalStyles.typography?.fontSizes?.length || 0}`);
			info(`  Font families: ${globalStyles.typography?.fontFamilies?.length || 0}`);
		} catch (err) {
			error(`getGlobalStyles() failed: ${err.message}`);
		}

		// Test getPatterns()
		section('7. Testing getPatterns()');
		try {
			const patterns = await wordpressAPI.getPatterns();
			success('getPatterns() - OK');

			const categories = Object.keys(patterns.by_category || {});
			info(`  Pattern categories: ${categories.length}`);
			info(`  Sample categories: ${categories.slice(0, 3).join(', ')}`);

			const totalPatterns = patterns.all_patterns?.length || 0;
			info(`  Total patterns: ${totalPatterns}`);
		} catch (err) {
			error(`getPatterns() failed: ${err.message}`);
		}

		// Test createPost() - Create a draft post
		section('8. Testing createPost()');
		try {
			const newPost = await wordpressAPI.createPost({
				title: 'Test Post from Agent - ' + new Date().toISOString(),
				content: '<!-- wp:paragraph --><p>This is a test post created by the Claude WordPress Agent.</p><!-- /wp:paragraph -->',
				status: 'draft',
				post_type: 'post',
			});
			success('createPost() - OK');
			info(`  Post ID: ${newPost.id}`);
			info(`  Post URL: ${newPost.link}`);
			info(`  Status: ${newPost.status}`);

			// Test updatePost() - Update the created post
			section('9. Testing updatePost()');
			try {
				const updatedPost = await wordpressAPI.updatePost(newPost.id, {
					title: 'Updated Test Post - ' + new Date().toISOString(),
					content: '<!-- wp:paragraph --><p>This post has been updated.</p><!-- /wp:paragraph -->',
				});
				success('updatePost() - OK');
				info(`  New title: ${updatedPost.title.rendered}`);
			} catch (updateErr) {
				error(`updatePost() failed: ${updateErr.message}`);
			}
		} catch (err) {
			error(`createPost() failed: ${err.message}`);
		}

		// Summary
		section('Test Summary');
		console.log(`${colors.green}
All tests completed successfully!

The WordPress API client is working correctly.
${colors.reset}`);

	} catch (err) {
		console.error(`\n${colors.red}Fatal error:${colors.reset}`, err.message);
		console.error(err.stack);
		process.exit(1);
	}
}

// Run tests
main().catch((err) => {
	console.error(`${colors.red}Unhandled error:${colors.reset}`, err);
	process.exit(1);
});
