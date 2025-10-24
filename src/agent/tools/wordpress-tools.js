/**
 * WordPress Tools
 *
 * Tools pour interagir avec l'API WordPress : créer/modifier posts,
 * gérer médias, taxonomies, utilisateurs, plugins.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';
import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Retourne la liste des tools WordPress pour Claude
 *
 * @param {Object} wordpressAPI - Instance du client WordPress API
 * @returns {Array} Liste des tools au format Anthropic
 */
export function getWordPressTools(wordpressAPI) {
	return [
		// 1. Découvrir les blocs disponibles
		{
			name: 'discover_available_blocks',
			description: 'Découvre tous les blocs Gutenberg disponibles dans WordPress, classés par catégorie. Utilise cet outil en premier pour savoir quels blocs sont disponibles avant de créer du contenu.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: discover_available_blocks');
				return await wordpressAPI.getBlocksSummary();
			},
		},

		// 2. Obtenir le résumé condensé d'une page
		{
			name: 'get_page_summary',
			description: 'Obtient un résumé condensé d\'une page/post existante : structure des blocs, contenu textuel (headings, paragraphes), images, boutons, vidéos, etc. TRÈS UTILE pour comprendre le contenu d\'une page avant de la modifier. Ce résumé est optimisé pour ne pas surcharger le contexte (500-800 tokens max).',
			input_schema: {
				type: 'object',
				properties: {
					post_id: {
						type: 'number',
						description: 'ID du post/page dont tu veux obtenir le résumé',
					},
				},
				required: ['post_id'],
			},
			handler: async (input) => {
				logger.info('Tool: get_page_summary', { post_id: input.post_id });
				return await wordpressAPI.getPageContext(input.post_id);
			},
		},

		// 3. Inspecter le schéma d'un bloc
		{
			name: 'inspect_block_schema',
			description: 'Inspecte le schéma complet d\'un bloc spécifique pour connaître tous ses attributs, supports et capacités. Utilise ceci pour comprendre exactement ce qu\'un bloc peut faire.',
			input_schema: {
				type: 'object',
				properties: {
					block_name: {
						type: 'string',
						description: 'Nom complet du bloc au format namespace/nom (ex: core/paragraph, nectar-blocks/hero, core/heading)',
					},
				},
				required: ['block_name'],
			},
			handler: async (input) => {
				logger.info('Tool: inspect_block_schema', { block: input.block_name });
				return await wordpressAPI.getBlockSchema(input.block_name);
			},
		},

		// 4. Récupérer un groupe d'attributs (progressive disclosure)
		{
			name: 'get_block_attributes_group',
			description: 'Récupère un groupe d\'attributs spécifique d\'un bloc (progressive disclosure). Pour les blocs complexes (50+ attributs), utilise ceci au lieu de inspect_block_schema pour éviter de surcharger le contexte.',
			input_schema: {
				type: 'object',
				properties: {
					block_name: {
						type: 'string',
						description: 'Nom du bloc (ex: nectar-blocks/hero)',
					},
					group: {
						type: 'string',
						enum: ['basic', 'advanced', 'styling', 'animation', 'responsive'],
						description: 'Groupe d\'attributs à récupérer',
					},
				},
				required: ['block_name', 'group'],
			},
			handler: async (input) => {
				logger.info('Tool: get_block_attributes_group', input);
				return await wordpressAPI.getBlockAttributesByGroup(input.block_name, input.group);
			},
		},

		// 5. Récupérer le design system du thème
		{
			name: 'get_theme_design_system',
			description: 'Récupère le design system complet du thème (couleurs, polices, tailles de police, espacements). TOUJOURS utiliser ces valeurs pour garantir la cohérence visuelle du site.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_theme_design_system');
				return await wordpressAPI.getGlobalStyles();
			},
		},

		// 6. Récupérer la LISTE des patterns disponibles (RÉSUMÉ SEULEMENT)
		{
			name: 'get_patterns',
			description: 'Récupère la LISTE des patterns disponibles (noms et catégories uniquement). Pour obtenir le contenu HTML d\'un pattern spécifique, utilise get_pattern_details. Progressive Disclosure: cette approche évite de surcharger le contexte.',
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async (input) => {
				logger.info('Tool: get_patterns (summary)');
				const patterns = await wordpressAPI.getPatterns();

				// Return SUMMARY only: name, title, categories
				return patterns.map(p => ({
					name: p.name,
					title: p.title,
					categories: p.categories || [],
					description: p.description?.substring(0, 100) || '', // Max 100 chars
				}));
			},
		},

		// 6b. Récupérer le CONTENU d'un pattern spécifique
		{
			name: 'get_pattern_details',
			description: 'Récupère le contenu HTML complet d\'un pattern spécifique par son nom. Utilise ceci UNIQUEMENT quand tu as choisi un pattern via get_patterns.',
			input_schema: {
				type: 'object',
				properties: {
					pattern_name: {
						type: 'string',
						description: 'Nom du pattern (ex: "core/query-standard-posts")',
					},
				},
				required: ['pattern_name'],
			},
			handler: async (input) => {
				logger.info('Tool: get_pattern_details', { pattern: input.pattern_name });
				const patterns = await wordpressAPI.getPatterns();
				const pattern = patterns.find(p => p.name === input.pattern_name);

				if (!pattern) {
					throw new Error(`Pattern not found: ${input.pattern_name}`);
				}

				return {
					name: pattern.name,
					title: pattern.title,
					content: pattern.content, // Full HTML content
					categories: pattern.categories,
					description: pattern.description,
				};
			},
		},

		// 7. Créer un nouveau post
		{
			name: 'create_post',
			description: 'Crée un nouveau post ou page WordPress avec du contenu Gutenberg. Le contenu DOIT être au format HTML Gutenberg valide (commentaires <!-- wp:bloc --> inclus).',
			input_schema: {
				type: 'object',
				properties: {
					title: {
						type: 'string',
						description: 'Titre du post',
					},
					content: {
						type: 'string',
						description: 'Contenu HTML Gutenberg validé (avec commentaires de blocs)',
					},
					status: {
						type: 'string',
						enum: ['draft', 'publish', 'pending'],
						description: 'Statut de publication',
					},
					post_type: {
						type: 'string',
						description: 'Type de post (post, page, product...)',
					},
				},
				required: ['title', 'content'],
			},
			handler: async (input) => {
				logger.info('Tool: create_post', { title: input.title });
				return await wordpressAPI.createPost(input);
			},
		},

		// 8. Mettre à jour les métadonnées d'un post (titre, statut, etc.)
		{
			name: 'update_post_title',
			description: '⚠️ Met à jour UNIQUEMENT les métadonnées d\'un post WordPress (titre, statut, slug, excerpt). NE PEUT PAS modifier le contenu des blocs. Pour modifier le contenu, utilise OBLIGATOIREMENT les tools en temps réel: update_block_realtime, insert_block_realtime, remove_block_realtime, replace_block_realtime.',
			input_schema: {
				type: 'object',
				properties: {
					post_id: {
						type: 'number',
						description: 'ID du post à mettre à jour',
					},
					title: {
						type: 'string',
						description: 'Nouveau titre du post (optionnel)',
					},
					status: {
						type: 'string',
						enum: ['draft', 'publish', 'pending', 'private'],
						description: 'Nouveau statut de publication (optionnel)',
					},
					slug: {
						type: 'string',
						description: 'Nouveau slug URL (optionnel)',
					},
					excerpt: {
						type: 'string',
						description: 'Nouvel extrait/résumé (optionnel)',
					},
				},
				required: ['post_id'],
			},
			handler: async (input) => {
				const { post_id, ...updateData } = input;

				// CRITICAL: Block content modification to force real-time Gutenberg tools usage
				if (updateData.content) {
					throw new Error('❌ ERREUR: Le tool update_post_title ne peut PAS modifier le contenu (content). Utilise les tools en temps réel: update_block_realtime, insert_block_realtime, remove_block_realtime pour modifier les blocs.');
				}

				logger.info('Tool: update_post_title', { post_id, fields: Object.keys(updateData) });
				return await wordpressAPI.updatePost(post_id, updateData);
			},
		},

		// 9. Chercher des templates de blocs pré-validés
		{
			name: 'search_block_templates',
			description: 'Cherche des templates JSON pré-validés pour un bloc spécifique. Les templates sont des configurations testées et validées qui garantissent le bon fonctionnement du bloc.',
			input_schema: {
				type: 'object',
				properties: {
					block_name: {
						type: 'string',
						description: 'Nom du bloc (ex: nectar-blocks/hero)',
					},
					use_case: {
						type: 'string',
						description: 'Cas d\'usage recherché (hero, features, testimonials, cta, etc.) - optionnel',
					},
				},
				required: ['block_name'],
			},
			handler: async (input) => {
				logger.info('Tool: search_block_templates', input);

				try {
					// Chemin vers le dossier templates
					const templatesDir = resolve(__dirname, '../../../templates');

					// Normaliser le nom du bloc pour le chemin (core/heading -> core)
					const [namespace] = input.block_name.split('/');

					// Chemin du dossier du namespace
					const namespaceDir = join(templatesDir, namespace);

					// Vérifier si le dossier existe
					try {
						await fs.access(namespaceDir);
					} catch {
						// Dossier n'existe pas
						return {
							found: false,
							templates: [],
							message: `No templates found for namespace: ${namespace}`,
						};
					}

					// Lister tous les fichiers JSON dans le dossier
					const files = await fs.readdir(namespaceDir);
					const jsonFiles = files.filter((file) => file.endsWith('.json'));

					// Filtrer par nom de bloc et use_case
					const templates = [];

					for (const file of jsonFiles) {
						const filePath = join(namespaceDir, file);
						const content = await fs.readFile(filePath, 'utf-8');
						const template = JSON.parse(content);

						// Vérifier si le template correspond au bloc
						if (template.blockName === input.block_name) {
							// Si use_case spécifié, filtrer par use_case
							if (!input.use_case || template.use_case === input.use_case) {
								templates.push({
									id: file.replace('.json', ''),
									file: file,
									...template,
								});
							}
						}
					}

					return {
						found: templates.length > 0,
						templates,
						count: templates.length,
					};
				} catch (error) {
					logger.error('Error searching block templates', { error: error.message });
					return {
						found: false,
						templates: [],
						error: error.message,
					};
				}
			},
		},
	];
}
