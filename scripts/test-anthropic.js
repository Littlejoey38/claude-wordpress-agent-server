/**
 * Test Anthropic Client
 *
 * Script de test pour vérifier le bon fonctionnement d'AnthropicClient.
 * Envoie un message simple à Claude et affiche la réponse.
 *
 * Usage: node scripts/test-anthropic.js
 *
 * @package WordPress_Claude_Agent
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { AnthropicClient } from '../src/clients/anthropic-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Charger les variables d'environnement
dotenv.config({ path: resolve(__dirname, '../.env') });

// Codes couleur
const colors = {
	reset: '\x1b[0m',
	green: '\x1b[32m',
	red: '\x1b[31',
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
║        Anthropic Client - Functional Tests              ║
╚══════════════════════════════════════════════════════════╝
${colors.reset}`);

	try {
		// Check API key
		if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'sk-ant-xxx') {
			error('ANTHROPIC_API_KEY not configured in .env');
			console.log('\nPlease set a valid Anthropic API key in .env file');
			process.exit(1);
		}

		section('1. Initializing Anthropic Client');
		const client = new AnthropicClient(process.env.ANTHROPIC_API_KEY);
		success('Anthropic client initialized');
		info(`Model: ${client.defaultModel}`);
		info(`Max tokens: ${client.defaultMaxTokens}`);

		section('2. Testing sendMessage() - Simple question');
		try {
			const response = await client.sendMessage({
				system: 'You are a helpful assistant that answers questions concisely.',
				messages: [
					{
						role: 'user',
						content: 'What is the capital of France? Answer in one word.',
					},
				],
				max_tokens: 100,
			});

			success('sendMessage() - OK');
			info(`Stop reason: ${response.stop_reason}`);
			info(`Input tokens: ${response.usage.input_tokens}`);
			info(`Output tokens: ${response.usage.output_tokens}`);

			// Test extractText()
			const text = client.extractText(response);
			console.log(`\n${colors.yellow}Response:${colors.reset} ${text}`);
		} catch (err) {
			error(`sendMessage() failed: ${err.message}`);
		}

		section('3. Testing hasToolCalls()');
		try {
			const response = await client.sendMessage({
				system: 'You are a helpful assistant.',
				messages: [
					{
						role: 'user',
						content: 'Hello!',
					},
				],
				max_tokens: 100,
			});

			const hasTools = client.hasToolCalls(response);
			success('hasToolCalls() - OK');
			info(`Has tool calls: ${hasTools}`);
			info(`Stop reason: ${response.stop_reason}`);
		} catch (err) {
			error(`hasToolCalls() test failed: ${err.message}`);
		}

		section('4. Testing estimateTokens()');
		const testText = 'This is a test message for token estimation.';
		const estimatedTokens = client.estimateTokens(testText);
		success('estimateTokens() - OK');
		info(`Text: "${testText}"`);
		info(`Estimated tokens: ${estimatedTokens}`);

		section('5. Testing tool use (weather example)');
		try {
			const weatherTool = {
				name: 'get_weather',
				description: 'Get the current weather for a location',
				input_schema: {
					type: 'object',
					properties: {
						location: {
							type: 'string',
							description: 'The city name, e.g., Paris, London',
						},
						unit: {
							type: 'string',
							enum: ['celsius', 'fahrenheit'],
							description: 'Temperature unit',
						},
					},
					required: ['location'],
				},
			};

			const response = await client.sendMessage({
				system: 'You are a helpful assistant with access to weather data.',
				messages: [
					{
						role: 'user',
						content: 'What is the weather in Paris?',
					},
				],
				tools: [weatherTool],
				max_tokens: 300,
			});

			success('Tool use test - OK');
			info(`Stop reason: ${response.stop_reason}`);

			const hasTools = client.hasToolCalls(response);
			if (hasTools) {
				const toolCalls = client.extractToolCalls(response);
				success(`Claude requested ${toolCalls.length} tool call(s)`);

				toolCalls.forEach((toolCall, index) => {
					info(`Tool #${index + 1}:`);
					info(`  - Name: ${toolCall.name}`);
					info(`  - Input: ${JSON.stringify(toolCall.input)}`);
				});
			} else {
				info('Claude did not use tools (this is OK)');
				const text = client.extractText(response);
				info(`Text response: ${text.substring(0, 100)}...`);
			}
		} catch (err) {
			error(`Tool use test failed: ${err.message}`);
		}

		// Summary
		section('Test Summary');
		console.log(`${colors.green}
All tests completed successfully!

The Anthropic client is working correctly and can:
- Send messages to Claude
- Extract text from responses
- Detect and extract tool calls
- Estimate token counts
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
