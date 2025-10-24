/**
 * Anthropic Client
 *
 * Wrapper autour du SDK Anthropic pour faciliter l'utilisation
 * et centraliser la configuration.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import Anthropic from '@anthropic-ai/sdk';
import logger from '../utils/logger.js';
import { AppError } from '../utils/errors.js';

/**
 * Configuration par défaut pour Claude
 */
const DEFAULT_MODEL = 'claude-sonnet-4-5';
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Classe AnthropicClient
 */
export class AnthropicClient {
	/**
	 * Constructeur
	 *
	 * @param {string} apiKey - Clé API Anthropic
	 */
	constructor(apiKey) {
		if (!apiKey) {
			throw new AppError('Anthropic API key is required', 500);
		}

		this.client = new Anthropic({
			apiKey: apiKey,
		});

		this.defaultModel = DEFAULT_MODEL;
		this.defaultMaxTokens = DEFAULT_MAX_TOKENS;
	}

	/**
	 * Envoie un message à Claude
	 *
	 * @param {Object} params - Paramètres du message
	 * @param {string} params.system - System prompt
	 * @param {Array} params.messages - Historique de conversation
	 * @param {Array} params.tools - Tools disponibles
	 * @param {number} params.max_tokens - Tokens max
	 * @param {string} params.model - Modèle à utiliser
	 * @param {boolean} params.extended_thinking - Enable extended thinking mode
	 * @returns {Promise<Object>} Réponse de Claude
	 */
	async sendMessage({
		system,
		messages,
		tools = [],
		max_tokens = this.defaultMaxTokens,
		model = this.defaultModel,
		extended_thinking = false,
	}) {
		try {
			logger.info('Sending message to Claude', {
				model,
				max_tokens,
				message_count: messages.length,
				tools_count: tools.length,
				extended_thinking,
			});

			const requestParams = {
				model,
				max_tokens,
				system,
				messages,
				tools,
			};

			// Add extended thinking parameter if enabled
			if (extended_thinking) {
				requestParams.thinking = {
					type: 'enabled',
					budget_tokens: 5000,
				};
			}

			const response = await this.client.messages.create(requestParams);

			logger.info('Received response from Claude', {
				stop_reason: response.stop_reason,
				usage: response.usage,
			});

			return response;
		} catch (error) {
			// Don't log here to avoid duplicate error messages (logged in orchestrator)
			throw new AppError(`Anthropic API error: ${error.message}`, 500);
		}
	}

	/**
	 * Stream un message (pour réponses en temps réel)
	 *
	 * @param {Object} params - Paramètres du message
	 * @returns {AsyncGenerator} Stream de réponse
	 */
	async *streamMessage({ system, messages, tools = [], max_tokens = this.defaultMaxTokens, model = this.defaultModel }) {
		try {
			logger.info('Starting Claude message stream', { model, max_tokens });

			const stream = await this.client.messages.stream({
				model,
				max_tokens,
				system,
				messages,
				tools,
			});

			for await (const chunk of stream) {
				yield chunk;
			}

			logger.info('Claude stream completed');
		} catch (error) {
			logger.error('Failed to stream message from Claude', { error: error.message });
			throw new AppError(`Anthropic streaming error: ${error.message}`, 500);
		}
	}

	/**
	 * Compte les tokens dans un texte (estimation)
	 *
	 * @param {string} text - Texte à analyser
	 * @returns {number} Nombre approximatif de tokens
	 */
	estimateTokens(text) {
		// Approximation simple : ~4 caractères = 1 token
		// Pour une estimation précise, il faudrait utiliser tiktoken ou l'API Anthropic
		return Math.ceil(text.length / 4);
	}

	/**
	 * Vérifie si une réponse contient des tool calls
	 *
	 * @param {Object} response - Réponse de Claude
	 * @returns {boolean} True si des tools sont demandés
	 */
	hasToolCalls(response) {
		return response.stop_reason === 'tool_use';
	}

	/**
	 * Extrait les tool calls d'une réponse
	 *
	 * @param {Object} response - Réponse de Claude
	 * @returns {Array} Liste des tool calls
	 */
	extractToolCalls(response) {
		if (!this.hasToolCalls(response)) {
			return [];
		}

		return response.content.filter((block) => block.type === 'tool_use');
	}

	/**
	 * Extrait le texte d'une réponse
	 *
	 * @param {Object} response - Réponse de Claude
	 * @returns {string} Texte de la réponse
	 */
	extractText(response) {
		const textBlocks = response.content.filter((block) => block.type === 'text');
		return textBlocks.map((block) => block.text).join('\n');
	}
}
