/**
 * Gutenberg Tools (Real-time via PostMessage)
 *
 * Tools pour manipuler l'éditeur Gutenberg en temps réel via PostMessage.
 * Ces tools retournent des commandes qui seront envoyées à l'iframe WordPress
 * via le stream SSE.
 *
 * IMPORTANT: Ces tools ne nécessitent PAS Playwright - ils utilisent
 * l'API JavaScript Gutenberg directement dans le navigateur.
 *
 * @package WordPress_Claude_Agent
 * @since 1.0.0
 */

import logger from '../../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { getPendingRequestsManager } from '../../services/pending-requests-manager.js';

/**
 * Retourne la liste des tools Gutenberg pour Claude
 *
 * @returns {Array} Liste des tools au format Anthropic
 */
export function getGutenbergTools() {
	return [
		// 0. Obtenir la structure complète des blocs avec clientIds (PRÉCISION CHIRURGICALE)
		{
			name: 'get_blocks_structure',
			description: `Récupère la structure COMPLÈTE des blocs de la page avec leurs clientIds uniques.

⭐ OUTIL ESSENTIEL POUR LA PRÉCISION:
- Chaque bloc (root et innerBlock à toutes profondeurs) a un clientId unique
- Tu peux ensuite modifier N'IMPORTE QUEL bloc via update_block_by_clientid
- Fonctionne à toutes les profondeurs d'imbrication (innerBlocks > innerBlocks > innerBlocks...)

WORKFLOW RECOMMANDÉ:
1. Appelle get_blocks_structure pour voir tous les blocs avec leurs clientIds
2. Identifie le(s) bloc(s) à modifier
3. Utilise update_block_by_clientid pour chaque bloc à modifier (ultra précis!)

EXEMPLE DE STRUCTURE RETOURNÉE:
[
  {
    "clientId": "abc123",
    "name": "nectar-blocks/row",
    "attributes": {...},
    "innerBlocks": [
      {
        "clientId": "def456",  ← ClientId du heading (à n'importe quelle profondeur!)
        "name": "nectar-blocks/heading",
        "attributes": { "content": "Mon titre" }
      },
      {
        "clientId": "ghi789",
        "name": "nectar-blocks/paragraph",
        "attributes": { "content": "Mon texte" },
        "innerBlocks": [
          {
            "clientId": "jkl012",  ← Imbrication profonde? Pas de problème!
            "name": "core/button"
          }
        ]
      }
    ]
  }
]`,
			input_schema: {
				type: 'object',
				properties: {},
				required: [],
			},
			handler: async () => {
				logger.info('Tool: get_blocks_structure');

				const requestId = uuidv4();
				const pendingManager = getPendingRequestsManager();

				// Créer une requête en attente qui sera résolue par le callback HTTP
				const resultPromise = pendingManager.createPendingRequest(requestId, 10000); // 10s timeout

				// Retourner la commande qui sera envoyée à l'iframe via SSE
				// NOTE: On retourne à la fois la commande ET une promesse
				// L'orchestrateur doit gérer ce cas spécial
				return {
					_command: 'gutenberg_action',
					action: 'get_blocks_structure',
					requestId: requestId,
					success: true,
					message: '📋 Fetching complete blocks structure with clientIds...',
					// IMPORTANT: Promesse qui sera résolue quand l'iframe répond
					_awaitResult: resultPromise,
				};
			},
		},

		// 1. Insérer un bloc dans l'éditeur (temps réel)
		{
			name: 'insert_block_realtime',
			description: 'Insère un nouveau bloc Gutenberg dans l\'éditeur en TEMPS RÉEL (rendu instantané). Le bloc apparaît immédiatement dans l\'éditeur sans recharger la page. TRÈS IMPORTANT: Utilise cet outil au lieu des outils WordPress REST API (create_post, update_post) pour une expérience utilisateur fluide et temps réel.',
			input_schema: {
				type: 'object',
				properties: {
					block_name: {
						type: 'string',
						description: 'Nom du bloc (ex: core/paragraph, core/heading, core/image, core/button)',
					},
					attributes: {
						type: 'object',
						description: 'Attributs du bloc. Pour core/paragraph: { content: "texte" }, pour core/heading: { content: "titre", level: 2 }, pour core/image: { url: "...", alt: "..." }',
					},
					index: {
						type: 'number',
						description: 'Position où insérer le bloc (0-based). Si non spécifié, le bloc est ajouté à la fin.',
					},
				},
				required: ['block_name', 'attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: insert_block_realtime', {
					block_name: input.block_name,
					index: input.index,
				});

				// Return a command object that will be sent via SSE to the frontend
				return {
					_command: 'gutenberg_action',
					action: 'insert_block',
					requestId: uuidv4(),
					blockName: input.block_name,
					attributes: input.attributes,
					index: input.index !== undefined ? input.index : null,
					success: true,
					message: `✅ Block "${input.block_name}" inserted at position ${input.index !== undefined ? input.index : 'end'}`,
				};
			},
		},

		// 2. Modifier un bloc par clientId (OUTIL PRINCIPAL - PRÉCISION CHIRURGICALE)
		{
			name: 'update_block_by_clientid',
			description: `⭐ OUTIL PRINCIPAL pour modifier N'IMPORTE QUEL bloc avec PRÉCISION ABSOLUE.

WORKFLOW RECOMMANDÉ (2 ÉTAPES):
1. Appelle get_blocks_structure pour obtenir tous les clientIds
2. Appelle update_block_by_clientid pour chaque bloc à modifier

AVANTAGES:
✅ Fonctionne à TOUTES les profondeurs d'imbrication
✅ Ne touche QUE le bloc ciblé, tous les autres restent intacts
✅ Pas besoin de recréer des parents ou des innerBlocks
✅ Précision chirurgicale: 1 bloc = 1 modification

EXEMPLE:
// Étape 1: Récupérer la structure
get_blocks_structure() retourne:
[
  {
    "clientId": "abc123",
    "name": "nectar-blocks/row",
    "innerBlocks": [
      {
        "clientId": "def456",  ← Tu veux modifier ce heading
        "name": "nectar-blocks/heading",
        "attributes": { "content": "Ancien titre" }
      },
      {
        "clientId": "ghi789",
        "name": "nectar-blocks/paragraph"  ← Ce bloc reste intact!
      }
    ]
  }
]

// Étape 2: Modifier SEULEMENT le heading
update_block_by_clientid({
  clientId: "def456",
  attributes: { content: "Nouveau titre" }
})
// ✅ Le paragraph et tous les autres blocs restent totalement intacts!`,
			input_schema: {
				type: 'object',
				properties: {
					clientId: {
						type: 'string',
						description: 'ClientId unique du bloc à modifier (obtenu via get_blocks_structure)',
					},
					attributes: {
						type: 'object',
						description: 'Nouveaux attributs à appliquer à CE bloc uniquement. Seuls les attributs fournis sont modifiés.',
					},
				},
				required: ['clientId', 'attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: update_block_by_clientid', {
					clientId: input.clientId,
					attributes: input.attributes,
				});

				return {
					_command: 'gutenberg_action',
					action: 'update_block_by_clientid',
					requestId: uuidv4(),
					clientId: input.clientId,
					attributes: input.attributes,
					success: true,
					message: `✅ Block ${input.clientId} updated`,
				};
			},
		},

		// 3. Supprimer un bloc (temps réel)
		{
			name: 'remove_block_realtime',
			description: `Supprime un bloc existant dans l'éditeur en TEMPS RÉEL. Le bloc disparaît instantanément.

DEUX MÉTHODES DISPONIBLES:
1. Par clientId (RECOMMANDÉ): Utilise get_blocks_structure pour obtenir le clientId
2. Par index: Utilise get_page_summary pour obtenir l'index

EXEMPLES:
// Méthode 1 (clientId - RECOMMANDÉ):
remove_block_realtime({ clientId: "abc123" })

// Méthode 2 (index):
remove_block_realtime({ index: 0 })`,
			input_schema: {
				type: 'object',
				properties: {
					clientId: {
						type: 'string',
						description: 'ClientId unique du bloc à supprimer (obtenu via get_blocks_structure)',
					},
					index: {
						type: 'number',
						description: 'Position du bloc à supprimer (0-based, obtenu via get_page_summary)',
					},
				},
				required: [],
			},
			handler: async (input) => {
				if (input.clientId) {
					logger.info('Tool: remove_block_realtime', { clientId: input.clientId });

					return {
						_command: 'gutenberg_action',
						action: 'remove_block',
						requestId: uuidv4(),
						clientId: input.clientId,
						success: true,
						message: `✅ Block ${input.clientId} removed`,
					};
				} else if (input.index !== undefined) {
					logger.info('Tool: remove_block_realtime', { index: input.index });

					return {
						_command: 'gutenberg_action',
						action: 'remove_block_by_index',
						requestId: uuidv4(),
						index: input.index,
						success: true,
						message: `✅ Block at index ${input.index} removed`,
					};
				} else {
					throw new Error('Either clientId or index must be provided');
				}
			},
		},

		// 4. Remplacer un bloc par un autre (temps réel)
		{
			name: 'replace_block_realtime',
			description: `Remplace un bloc existant par un nouveau bloc de type différent en TEMPS RÉEL. Par exemple, transformer un paragraphe en heading.

DEUX MÉTHODES DISPONIBLES:
1. Par clientId (RECOMMANDÉ): Utilise get_blocks_structure pour obtenir le clientId
2. Par index: Utilise get_page_summary pour obtenir l'index

EXEMPLES:
// Méthode 1 (clientId - RECOMMANDÉ):
replace_block_realtime({
  clientId: "abc123",
  new_block_name: "core/heading",
  new_attributes: { content: "Nouveau titre", level: 2 }
})

// Méthode 2 (index):
replace_block_realtime({
  index: 0,
  new_block_name: "core/heading",
  new_attributes: { content: "Nouveau titre", level: 2 }
})`,
			input_schema: {
				type: 'object',
				properties: {
					clientId: {
						type: 'string',
						description: 'ClientId unique du bloc à remplacer (obtenu via get_blocks_structure)',
					},
					index: {
						type: 'number',
						description: 'Position du bloc à remplacer (0-based, obtenu via get_page_summary)',
					},
					new_block_name: {
						type: 'string',
						description: 'Nom du nouveau bloc (ex: core/heading, core/image)',
					},
					new_attributes: {
						type: 'object',
						description: 'Attributs du nouveau bloc',
					},
				},
				required: ['new_block_name', 'new_attributes'],
			},
			handler: async (input) => {
				if (input.clientId) {
					logger.info('Tool: replace_block_realtime', {
						clientId: input.clientId,
						new_block_name: input.new_block_name,
					});

					return {
						_command: 'gutenberg_action',
						action: 'replace_block',
						requestId: uuidv4(),
						clientId: input.clientId,
						newBlockName: input.new_block_name,
						newAttributes: input.new_attributes,
						success: true,
						message: `✅ Block ${input.clientId} replaced with ${input.new_block_name}`,
					};
				} else if (input.index !== undefined) {
					logger.info('Tool: replace_block_realtime', {
						index: input.index,
						new_block_name: input.new_block_name,
					});

					return {
						_command: 'gutenberg_action',
						action: 'replace_block_by_index',
						requestId: uuidv4(),
						index: input.index,
						newBlockName: input.new_block_name,
						newAttributes: input.new_attributes,
						success: true,
						message: `✅ Block at index ${input.index} replaced with ${input.new_block_name}`,
					};
				} else {
					throw new Error('Either clientId or index must be provided');
				}
			},
		},

		// ========== TOOLS WITH PERSISTENT IDs (claudeAgentId) ==========

		// 5. Modifier un bloc par claudeAgentId (ID PERSISTANT - RECOMMANDÉ!)
		{
			name: 'update_block_by_agent_id',
			description: `⭐ OUTIL RECOMMANDÉ pour modifier des blocs de manière PERSISTANTE.

AVANTAGE MAJEUR: Contrairement au clientId (volatile), le claudeAgentId:
✅ Persiste après rafraîchissement de page
✅ Persiste après redémarrage navigateur
✅ Permet de modifier le même bloc de manière fiable

WORKFLOW:
1. Appelle get_blocks_structure pour obtenir tous les claudeAgentId
2. Utilise update_block_by_agent_id pour modifier les blocs
3. Les IDs restent valides même si l'utilisateur rafraîchit la page!

EXEMPLE:
// Étape 1: get_blocks_structure retourne:
{
  "claudeAgentId": "550e8400-e29b-41d4-a716-446655440000",
  "clientId": "abc123",  // Ce clientId change à chaque reload!
  "name": "core/heading",
  "attributes": { "content": "Ancien titre" }
}

// Étape 2: Modifier avec l'agentId persistant
update_block_by_agent_id({
  agentId: "550e8400-e29b-41d4-a716-446655440000",
  attributes: { "content": "Nouveau titre" }
})
// ✅ Fonctionne même après reload de la page!`,
			input_schema: {
				type: 'object',
				properties: {
					agentId: {
						type: 'string',
						description: 'claudeAgentId persistant du bloc (obtenu via get_blocks_structure)',
					},
					attributes: {
						type: 'object',
						description: 'Nouveaux attributs à appliquer au bloc',
					},
				},
				required: ['agentId', 'attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: update_block_by_agent_id', {
					agentId: input.agentId,
					attributes: input.attributes,
				});

				return {
					_command: 'gutenberg_action',
					action: 'update_block_by_agent_id',
					requestId: uuidv4(),
					agentId: input.agentId,
					attributes: input.attributes,
					success: true,
					message: `✅ Block with agentId ${input.agentId} updated`,
				};
			},
		},

		// 6. Supprimer un bloc par claudeAgentId (ID PERSISTANT)
		{
			name: 'remove_block_by_agent_id',
			description: `Supprime un bloc en utilisant son claudeAgentId PERSISTANT.

AVANTAGE: L'agentId reste valide après rafraîchissement de page.

EXEMPLE:
remove_block_by_agent_id({
  agentId: "550e8400-e29b-41d4-a716-446655440000"
})`,
			input_schema: {
				type: 'object',
				properties: {
					agentId: {
						type: 'string',
						description: 'claudeAgentId persistant du bloc à supprimer',
					},
				},
				required: ['agentId'],
			},
			handler: async (input) => {
				logger.info('Tool: remove_block_by_agent_id', {
					agentId: input.agentId,
				});

				return {
					_command: 'gutenberg_action',
					action: 'remove_block_by_agent_id',
					requestId: uuidv4(),
					agentId: input.agentId,
					success: true,
					message: `✅ Block with agentId ${input.agentId} removed`,
				};
			},
		},

		// 7. Remplacer un bloc par claudeAgentId (ID PERSISTANT)
		{
			name: 'replace_block_by_agent_id',
			description: `Remplace un bloc existant par un nouveau bloc en utilisant le claudeAgentId PERSISTANT.

AVANTAGE: L'agentId reste valide après rafraîchissement de page.

EXEMPLE:
replace_block_by_agent_id({
  agentId: "550e8400-e29b-41d4-a716-446655440000",
  new_block_name: "core/heading",
  new_attributes: { content: "Nouveau titre", level: 2 }
})`,
			input_schema: {
				type: 'object',
				properties: {
					agentId: {
						type: 'string',
						description: 'claudeAgentId persistant du bloc à remplacer',
					},
					new_block_name: {
						type: 'string',
						description: 'Nom du nouveau bloc (ex: core/heading, core/image)',
					},
					new_attributes: {
						type: 'object',
						description: 'Attributs du nouveau bloc',
					},
				},
				required: ['agentId', 'new_block_name', 'new_attributes'],
			},
			handler: async (input) => {
				logger.info('Tool: replace_block_by_agent_id', {
					agentId: input.agentId,
					new_block_name: input.new_block_name,
				});

				return {
					_command: 'gutenberg_action',
					action: 'replace_block_by_agent_id',
					requestId: uuidv4(),
					agentId: input.agentId,
					newBlockName: input.new_block_name,
					newAttributes: input.new_attributes,
					success: true,
					message: `✅ Block with agentId ${input.agentId} replaced with ${input.new_block_name}`,
				};
			},
		},

		// ========== PATTERN TOOLS ==========

		// 8. Insérer un pattern WordPress
		{
			name: 'insert_pattern',
			description: `Insère un pattern WordPress (ensemble de blocs pré-configurés) dans l'éditeur.

⭐ OUTIL RECOMMANDÉ pour insérer des sections complètes (hero, features, pricing, etc.)

WORKFLOW:
1. Appelle get_patterns pour voir tous les patterns disponibles
2. Utilise insert_pattern avec le slug du pattern choisi
3. Le pattern est inséré à la position spécifiée (ou à la fin)

EXEMPLE:
// Voir les patterns disponibles
get_patterns() → [
  { slug: "hero-section", title: "Hero Section", ... },
  { slug: "features-3-cols", title: "Features 3 Columns", ... }
]

// Insérer le pattern hero en début de page
insert_pattern({
  pattern_slug: "hero-section",
  index: 0
})`,
			input_schema: {
				type: 'object',
				properties: {
					pattern_slug: {
						type: 'string',
						description: 'Slug du pattern à insérer (obtenu via get_patterns)',
					},
					index: {
						type: 'number',
						description: 'Position où insérer le pattern (0-based). Si non spécifié, le pattern est ajouté à la fin.',
					},
				},
				required: ['pattern_slug'],
			},
			handler: async (input) => {
				logger.info('Tool: insert_pattern', {
					pattern_slug: input.pattern_slug,
					index: input.index,
				});

				return {
					_command: 'gutenberg_action',
					action: 'insert_pattern',
					requestId: uuidv4(),
					patternSlug: input.pattern_slug,
					index: input.index !== undefined ? input.index : null,
					success: true,
					message: `✅ Pattern "${input.pattern_slug}" will be inserted at position ${input.index !== undefined ? input.index : 'end'}`,
				};
			},
		},

		// 9. Remplacer un bloc par un pattern
		{
			name: 'swap_pattern',
			description: `Remplace un bloc existant par un pattern WordPress.

Utile pour transformer rapidement une section basique en une section complète et professionnelle.

WORKFLOW:
1. Appelle get_blocks_structure pour obtenir le claudeAgentId du bloc à remplacer
2. Appelle get_patterns pour choisir le pattern de remplacement
3. Utilise swap_pattern pour faire le remplacement

EXEMPLE:
// Remplacer un simple paragraphe par une hero complète
swap_pattern({
  agentId: "550e8400-e29b-41d4-a716-446655440000",
  pattern_slug: "hero-section"
})`,
			input_schema: {
				type: 'object',
				properties: {
					agentId: {
						type: 'string',
						description: 'claudeAgentId persistant du bloc à remplacer',
					},
					pattern_slug: {
						type: 'string',
						description: 'Slug du pattern qui va remplacer le bloc',
					},
				},
				required: ['agentId', 'pattern_slug'],
			},
			handler: async (input) => {
				logger.info('Tool: swap_pattern', {
					agentId: input.agentId,
					pattern_slug: input.pattern_slug,
				});

				return {
					_command: 'gutenberg_action',
					action: 'swap_pattern',
					requestId: uuidv4(),
					agentId: input.agentId,
					patternSlug: input.pattern_slug,
					success: true,
					message: `✅ Block with agentId ${input.agentId} will be replaced with pattern "${input.pattern_slug}"`,
				};
			},
		},
	];
}
