/**
 * WordPress Claude Agent Server
 *
 * Point d'entrée principal du serveur Node.js qui orchestre l'agent Claude
 * pour la création et gestion autonome de sites WordPress via Gutenberg.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import dotenv from 'dotenv';
import express from 'express';
import { Orchestrator } from './agent/orchestrator.js';
import logger from './utils/logger.js';
import { AppError } from './utils/errors.js';

// Charger les variables d'environnement
dotenv.config();

// Configuration
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Créer l'application Express
const app = express();

// Variable globale pour l'orchestrateur
let orchestrator = null;

// Middleware
app.use(express.json());

// CORS middleware - Allow requests from SaaS frontend
app.use((req, res, next) => {
	const allowedOrigins = [
		'http://localhost:3001',
		process.env.SAAS_FRONTEND_URL,
	].filter(Boolean);

	const origin = req.headers.origin;
	if (allowedOrigins.includes(origin)) {
		res.setHeader('Access-Control-Allow-Origin', origin);
	}

	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
	res.setHeader('Access-Control-Allow-Credentials', 'true');

	// Handle preflight requests
	if (req.method === 'OPTIONS') {
		return res.sendStatus(200);
	}

	next();
});

// Logger pour toutes les requêtes
app.use((req, res, next) => {
	logger.http(`${req.method} ${req.path}`);
	next();
});

/**
 * Initialise l'orchestrateur Claude
 */
async function initializeAgent() {
	try {
		const config = {
			wordpress: {
				url: process.env.WORDPRESS_URL,
				user: process.env.WORDPRESS_USER,
				appPassword: process.env.WORDPRESS_APP_PASSWORD,
			},
			anthropic: {
				apiKey: process.env.ANTHROPIC_API_KEY,
			},
			redis: {
				url: process.env.REDIS_URL,
				enabled: process.env.REDIS_ENABLED === 'true',
			},
			cache: {
				ttl: parseInt(process.env.CACHE_TTL || '3600', 10),
				schemaEnabled: process.env.SCHEMA_CACHE_ENABLED === 'true',
			},
			playwright: {
				headless: process.env.HEADLESS === 'true',
				timeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
			},
		};

		// Valider la configuration
		if (!config.wordpress.url || !config.wordpress.user || !config.wordpress.appPassword) {
			throw new AppError('Missing WordPress configuration in .env', 500);
		}

		if (!config.anthropic.apiKey) {
			throw new AppError('Missing Anthropic API key in .env', 500);
		}

		// Initialiser l'orchestrateur
		const orchestrator = new Orchestrator(config);
		await orchestrator.initialize();

		logger.info('Agent Claude orchestrator initialized successfully');
		return orchestrator;
	} catch (error) {
		logger.error('Failed to initialize agent orchestrator', { error: error.message });
		throw error;
	}
}

/**
 * Route de santé
 */
app.get('/health', (req, res) => {
	res.json({
		status: 'ok',
		environment: NODE_ENV,
		timestamp: new Date().toISOString(),
	});
});

/**
 * Route principale pour traiter les requêtes utilisateur
 *
 * POST /agent/process
 * Body: { message: string, options?: object }
 */
app.post('/agent/process', async (req, res) => {
	try {
		const { message, options = {} } = req.body;

		if (!message || typeof message !== 'string') {
			throw new AppError('Invalid request: message is required', 400);
		}

		if (!orchestrator) {
			throw new AppError('Orchestrator not initialized', 500);
		}

		logger.info('Processing user request', { message: message.substring(0, 100) });

		// Traiter la requête avec l'orchestrateur
		const result = await orchestrator.processRequest(message, options);

		res.json({
			success: true,
			result,
		});
	} catch (error) {
		logger.error('Error processing request', { error: error.message });

		const statusCode = error instanceof AppError ? error.statusCode : 500;
		res.status(statusCode).json({
			success: false,
			error: error.message,
		});
	}
});

/**
 * Route streaming pour voir les actions de l'agent en temps réel (SSE)
 *
 * POST /agent/process-stream
 * Body: { message: string, wordpress_context?: object, options?: object }
 */
app.post('/agent/process-stream', async (req, res) => {
	try {
		const { message, conversation_id, wordpress_context, options = {} } = req.body;

		if (!message || typeof message !== 'string') {
			throw new AppError('Invalid request: message is required', 400);
		}

		if (!orchestrator) {
			throw new AppError('Orchestrator not initialized', 500);
		}

		// Set up SSE
		res.setHeader('Content-Type', 'text/event-stream');
		res.setHeader('Cache-Control', 'no-cache');
		res.setHeader('Connection', 'keep-alive');
		res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

		// Function to send SSE events
		const sendEvent = (type, data) => {
			res.write(`event: ${type}\n`);
			res.write(`data: ${JSON.stringify(data)}\n\n`);
		};

		logger.info('Starting streaming request', {
			message: message.substring(0, 100),
			conversation_id: conversation_id || 'new',
			has_context: !!wordpress_context,
			context: wordpress_context
		});

		// Process request with streaming callbacks, WordPress context, and conversation persistence
		const result = await orchestrator.processRequestStream(message, {
			...options,
			conversation_id, // IMPORTANT: Passer le conversation_id pour charger l'historique
			wordpress_context,
			onIterationStart: (iteration, maxIterations) => {
				sendEvent('iteration_start', { iteration, maxIterations });
			},
			onToolCall: (toolName, input) => {
				sendEvent('tool_call', { toolName, input });
			},
			onToolResult: (toolName, success, toolResult) => {
				sendEvent('tool_result', {
					toolName,
					success,
					resultSummary: success ? 'OK' : (toolResult?.message || 'Error')
				});
			},
			onFinalResponse: (response, usage, conversationId) => {
				// Envoyer le conversation_id au frontend pour qu'il puisse continuer la conversation
				sendEvent('final_response', {
					response,
					usage,
					conversation_id: conversationId // IMPORTANT: Le frontend doit stocker cet ID
				});
			},
			onError: (error) => {
				sendEvent('error', { message: error.message });
			}
		});

		logger.info('Streaming request completed', {
			conversation_id: result.conversation_id,
			iterations: result.iterations
		});

		res.end();
	} catch (error) {
		logger.error('Error in streaming endpoint', { error: error.message });

		// Try to send error via SSE if headers not sent yet
		if (!res.headersSent) {
			res.status(500).json({ success: false, error: error.message });
		} else {
			res.write(`event: error\n`);
			res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
			res.end();
		}
	}
});

/**
 * Gestionnaire d'erreurs global
 */
app.use((error, req, res, next) => {
	logger.error('Unhandled error', { error: error.message, stack: error.stack });

	const statusCode = error instanceof AppError ? error.statusCode : 500;
	res.status(statusCode).json({
		success: false,
		error: error.message || 'Internal server error',
	});
});

/**
 * Démarrage du serveur
 */
async function start() {
	try {
		// Initialiser l'orchestrateur
		orchestrator = await initializeAgent();

		// Démarrer le serveur Express
		app.listen(PORT, () => {
			logger.info(`WordPress Claude Agent server started`, {
				port: PORT,
				environment: NODE_ENV,
			});
		});
	} catch (error) {
		logger.error('Failed to start server', { error: error.message });
		process.exit(1);
	}
}

// Gestion de l'arrêt gracieux
process.on('SIGTERM', () => {
	logger.info('SIGTERM signal received: closing server gracefully');
	process.exit(0);
});

process.on('SIGINT', () => {
	logger.info('SIGINT signal received: closing server gracefully');
	process.exit(0);
});

// Démarrer le serveur
start();
