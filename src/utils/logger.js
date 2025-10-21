/**
 * Logger
 *
 * Logging structuré avec Winston.
 * Niveaux : error, warn, info, http, verbose, debug, silly
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir __dirname en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Niveau de log depuis .env
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Format personnalisé pour les logs
 */
const customFormat = winston.format.combine(
	winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
	winston.format.errors({ stack: true }),
	winston.format.metadata({ fillExcept: ['message', 'level', 'timestamp'] }),
	winston.format.printf(({ level, message, timestamp, metadata }) => {
		let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

		// Ajouter les métadonnées si présentes
		if (metadata && Object.keys(metadata).length > 0) {
			log += ` ${JSON.stringify(metadata)}`;
		}

		return log;
	})
);

/**
 * Création du logger Winston
 */
const logger = winston.createLogger({
	level: LOG_LEVEL,
	format: customFormat,
	transports: [
		// Console (toujours actif)
		new winston.transports.Console({
			format: winston.format.combine(
				winston.format.colorize(),
				customFormat
			),
		}),

		// Fichier pour les erreurs
		new winston.transports.File({
			filename: path.join(__dirname, '../../logs/error.log'),
			level: 'error',
			maxsize: 5242880, // 5MB
			maxFiles: 5,
		}),

		// Fichier pour tous les logs
		new winston.transports.File({
			filename: path.join(__dirname, '../../logs/combined.log'),
			maxsize: 5242880, // 5MB
			maxFiles: 5,
		}),
	],
	// Ne pas quitter sur erreur
	exitOnError: false,
});

/**
 * Stream pour Morgan (logs HTTP)
 */
logger.stream = {
	write: (message) => {
		logger.http(message.trim());
	},
};

/**
 * Log de démarrage
 */
logger.info('Logger initialized', {
	level: LOG_LEVEL,
	environment: NODE_ENV,
});

export default logger;
