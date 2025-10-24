# Distribution des Tools par Sub-Agent

Ce document définit quels tools sont accessibles à chaque sub-agent pour optimiser leurs performances et éviter la surcharge de contexte.

## 🎯 Principe

Chaque sub-agent a accès UNIQUEMENT aux tools nécessaires à sa spécialisation. Cela permet de :
- ✅ Réduire la taille du contexte envoyé à Claude
- ✅ Améliorer la précision des réponses (moins de choix = meilleure décision)
- ✅ Sécuriser les opérations (chaque agent ne peut faire que ce pour quoi il est conçu)

---

## 📝 SEO Agent

**Rôle** : Optimiser la structure SEO, meta descriptions, keywords, URL slugs, hiérarchie des titres

### Tools Assignés (7 tools)

#### Lecture/Analyse
- ✅ `get_page_summary` - Analyser la structure existante
- ✅ `get_blocks_structure` - Voir la hiérarchie des blocs (H1, H2, H3)
- ✅ `inspect_block_schema` - Comprendre les attributs disponibles (level, content, etc.)

#### Modification
- ✅ `update_post_title` - Modifier titre, slug URL, excerpt/meta description
- ✅ `update_block_by_clientid` - Modifier un bloc spécifique (headings, paragraphs)
- ✅ `update_block_by_agent_id` - Modifier avec ID persistant

#### Création limitée
- ✅ `insert_block_realtime` - Insérer des headings manquants pour la structure SEO

### Cas d'Usage Typiques
```javascript
// 1. Analyser la structure
get_page_summary(post_id: 123)
get_blocks_structure()

// 2. Optimiser la hiérarchie des titres
update_block_by_agent_id({
  agentId: "heading-1",
  attributes: { content: "Titre optimisé avec mot-clé principal", level: 1 }
})

// 3. Optimiser les métadonnées
update_post_title({
  post_id: 123,
  title: "Titre SEO optimisé | Brand",
  slug: "titre-seo-optimise",
  excerpt: "Meta description de 150-160 caractères avec CTA claire"
})

// 4. Ajouter un H2 manquant
insert_block_realtime({
  block_name: "core/heading",
  attributes: { content: "Sous-titre avec mot-clé secondaire", level: 2 },
  index: 2
})
```

### ❌ Tools NON Accessibles
- Pas de suppression de blocs (`remove_block_*`)
- Pas de remplacement de blocs (`replace_block_*`)
- Pas de patterns (`insert_pattern`, `swap_pattern`)
- Pas de styles globaux (`update_global_styles`)

---

## ✍️ Copywriting Agent

**Rôle** : Créer contenu persuasif, titres accrocheurs, CTAs efficaces, storytelling

### Tools Assignés (13 tools)

#### Découverte
- ✅ `discover_available_blocks` - Connaître les blocs disponibles
- ✅ `get_page_summary` - Comprendre le contenu existant
- ✅ `get_blocks_structure` - Voir la structure complète
- ✅ `inspect_block_schema` - Connaître les attributs des blocs
- ✅ `get_patterns` - Liste des patterns disponibles
- ✅ `get_pattern_details` - Détails d'un pattern spécifique

#### Création de Contenu
- ✅ `insert_block_realtime` - Ajouter paragraphes, headings, buttons, lists
- ✅ `insert_pattern` - Insérer des sections complètes (hero, features, testimonials)
- ✅ `create_post` - Créer des posts/pages complets

#### Modification de Contenu
- ✅ `update_block_by_clientid` - Modifier le texte d'un bloc
- ✅ `update_block_by_agent_id` - Modifier avec ID persistant
- ✅ `replace_block_realtime` - Transformer un bloc (ex: paragraph → heading)
- ✅ `replace_block_by_agent_id` - Remplacer avec ID persistant

### Cas d'Usage Typiques
```javascript
// 1. Analyser le contenu existant
get_page_summary(post_id: 123)
get_blocks_structure()

// 2. Créer un CTA accrocheur
insert_block_realtime({
  block_name: "core/button",
  attributes: {
    text: "Commencer gratuitement →",
    url: "/signup",
    className: "is-style-fill"
  },
  index: 5
})

// 3. Modifier un paragraphe pour le rendre plus persuasif
update_block_by_agent_id({
  agentId: "para-1",
  attributes: {
    content: "Transformez votre business en 30 jours avec notre méthode éprouvée. Plus de 10 000 entrepreneurs nous font confiance."
  }
})

// 4. Insérer une section témoignages complète
get_patterns() // Voir les patterns disponibles
insert_pattern({
  pattern_slug: "testimonials-3-cols",
  index: 8
})

// 5. Transformer un paragraphe basique en heading accrocheur
replace_block_by_agent_id({
  agentId: "para-2",
  new_block_name: "core/heading",
  new_attributes: {
    content: "3 Raisons Pour Lesquelles Vous Devez Agir Maintenant",
    level: 2
  }
})
```

### ❌ Tools NON Accessibles
- Pas de suppression de blocs (`remove_block_*`) - Focus sur la création
- Pas de styles globaux (`update_global_styles`)
- Pas de design system (`get_theme_design_system`) - Le design agent s'en charge

---

## 🎨 Design Agent

**Rôle** : Assurer cohérence visuelle, design system, accessibilité (WCAG AA), responsive design

### Tools Assignés (13 tools)

#### Découverte & Design System
- ✅ `discover_available_blocks` - Connaître les blocs disponibles
- ✅ `get_theme_design_system` - **ESSENTIEL** - Couleurs, polices, espacements du thème
- ✅ `get_page_summary` - Voir la structure existante
- ✅ `get_blocks_structure` - Analyser les blocs
- ✅ `inspect_block_schema` - Connaître les attributs de style
- ✅ `get_block_attributes_group` - Progressive disclosure pour styling/animation
- ✅ `get_patterns` - Liste des patterns bien designés
- ✅ `get_pattern_details` - Détails d'un pattern

#### Modification Visuelle
- ✅ `update_block_by_clientid` - Modifier les styles d'un bloc
- ✅ `update_block_by_agent_id` - Modifier avec ID persistant
- ✅ `insert_pattern` - Insérer des patterns professionnels
- ✅ `swap_pattern` - Remplacer un bloc par un pattern

#### Styles Globaux (À UTILISER AVEC PRÉCAUTION)
- ✅ `update_global_styles` - Modifier les styles globaux du site

### Cas d'Usage Typiques
```javascript
// 1. Analyser le design system du thème
get_theme_design_system()
// Retourne: { colors: { primary: "#0066cc", secondary: "#ff6600" }, typography: { fontSizes: {...} } }

// 2. Analyser les blocs existants
get_blocks_structure()

// 3. Modifier les couleurs d'un bloc pour respecter le design system
update_block_by_agent_id({
  agentId: "hero-1",
  attributes: {
    backgroundColor: "primary", // Utilise le slug du thème
    textColor: "white",
    padding: "large" // Utilise l'échelle du thème
  }
})

// 4. Inspecter les attributs de style d'un bloc complexe (progressive disclosure)
get_block_attributes_group({
  block_name: "nectar-blocks/hero",
  group: "styling"
})

// 5. Remplacer un bloc basique par un pattern professionnel
get_patterns() // Voir les patterns disponibles
swap_pattern({
  agentId: "section-1",
  pattern_slug: "hero-modern"
})

// 6. Vérifier les attributs d'animation d'un bloc
get_block_attributes_group({
  block_name: "nectar-blocks/hero",
  group: "animation"
})
```

### ⚠️ Règles Importantes
- **TOUJOURS** utiliser les valeurs du design system (slugs de couleurs, tailles de police)
- **JAMAIS** utiliser des valeurs hardcodées (#hex, px) sauf si absolument nécessaire
- Vérifier le contraste texte/fond (minimum 4.5:1 pour WCAG AA)
- Tailles de boutons/liens : minimum 44x44px (touch targets)

### ❌ Tools NON Accessibles
- Pas de création de blocs (`insert_block_realtime`) - Focus sur le style, pas le contenu
- Pas de suppression/remplacement de blocs (sauf `swap_pattern` pour patterns)
- Pas de création de posts (`create_post`)
- Pas de modification de titre/slug (`update_post_title`)

---

## 📊 Résumé de la Distribution

| Tool | SEO | Copywriting | Design |
|------|-----|-------------|--------|
| **Découverte** |
| `discover_available_blocks` | ❌ | ✅ | ✅ |
| `get_page_summary` | ✅ | ✅ | �� |
| `get_blocks_structure` | ✅ | ✅ | ✅ |
| `inspect_block_schema` | ✅ | ✅ | ✅ |
| `get_block_attributes_group` | ❌ | ❌ | ✅ |
| `get_theme_design_system` | ❌ | ❌ | ✅ |
| `get_patterns` | ❌ | ✅ | ✅ |
| `get_pattern_details` | ❌ | ✅ | ✅ |
| **Création** |
| `create_post` | ❌ | ✅ | ❌ |
| `insert_block_realtime` | ✅ | ✅ | ❌ |
| `insert_pattern` | ❌ | ✅ | ✅ |
| **Modification** |
| `update_post_title` | ✅ | ❌ | ❌ |
| `update_block_by_clientid` | ✅ | ✅ | ✅ |
| `update_block_by_agent_id` | ✅ | ✅ | ✅ |
| `update_global_styles` | ❌ | ❌ | ⚠️ |
| **Transformation** |
| `replace_block_realtime` | ❌ | ✅ | ❌ |
| `replace_block_by_agent_id` | ❌ | ✅ | ❌ |
| `swap_pattern` | ❌ | ❌ | ✅ |
| **Suppression** |
| `remove_block_realtime` | ❌ | ❌ | ❌ |
| `remove_block_by_agent_id` | ❌ | ❌ | ❌ |

**Total tools par agent:**
- SEO Agent: 7 tools
- Copywriting Agent: 13 tools
- Design Agent: 13 tools

---

## 🚀 Implémentation avec Claude SDK

Le système utilise le **système d'agents natif du Claude SDK** au lieu d'un manager custom. Claude choisit automatiquement le bon agent basé sur les descriptions en langage naturel.

### Configuration des Agents

Les agents sont définis dans `agents-config.js` au format `AgentDefinition`:

```javascript
// agents-config.js
export const agentsConfig = {
  seo: {
    description: `Use this agent for SEO optimization tasks:
    - Optimizing content structure (H1, H2, H3 hierarchy)
    - Generating optimized meta descriptions
    - Creating SEO-friendly URL slugs...`,

    tools: [
      'get_page_summary',
      'get_blocks_structure',
      'update_post_title',
      // ... 7 tools au total
    ],

    prompt: `Tu es un expert SEO spécialisé dans WordPress...`,
    model: 'inherit',
  },

  copywriting: {
    description: `Use this agent for content creation and persuasive writing...`,
    tools: [ /* 13 tools */ ],
    prompt: `Tu es un copywriter expert...`,
    model: 'inherit',
  },

  design: {
    description: `Use this agent for visual design and UX/UI tasks...`,
    tools: [ /* 13 tools */ ],
    prompt: `Tu es un designer UX/UI expert...`,
    model: 'inherit',
  },
};
```

### Utilisation dans l'Orchestrateur

```javascript
import Anthropic from '@anthropic-ai/sdk';
import { agentsConfig } from './agents-config.js';
import { getWordPressTools } from './tools/wordpress-tools.js';
import { getGutenbergTools } from './tools/gutenberg-tools.js';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Rassembler tous les tools
const allTools = [
  ...getWordPressTools(wordpressAPI),
  ...getGutenbergTools(),
  ...getFSETools(wordpressAPI),
];

// Créer une conversation avec les agents
const message = await anthropic.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 8192,
  system: ORCHESTRATOR_SYSTEM_PROMPT,
  messages: [
    {
      role: 'user',
      content: userRequest,
    },
  ],
  tools: allTools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  })),
  // 🎯 CLÉS DU SYSTÈME D'AGENTS
  // Claude analyse automatiquement la tâche et route vers le bon agent
  metadata: {
    agents: agentsConfig,
  },
});
```

### Comment ça Fonctionne

1. **Claude analyse la demande utilisateur** en langage naturel
2. **Claude lit les descriptions des agents** (seo, copywriting, design)
3. **Claude choisit automatiquement le bon agent** basé sur la similarité sémantique
4. **L'agent choisi n'a accès qu'à ses tools** définis dans `tools: [...]`
5. **L'agent exécute la tâche** avec son system prompt spécialisé

### Avantages de cette Approche

✅ **Intelligence native de Claude** - Pas besoin de mots-clés ou de regex
✅ **Routing sémantique** - Claude comprend le contexte et l'intention
✅ **Flexibilité** - Facile d'ajouter de nouveaux agents
✅ **Isolation des tools** - Chaque agent n'a que les tools nécessaires
✅ **Moins de code** - Le SDK gère tout automatiquement

---

## 📝 Notes

- **Orchestrator** : L'orchestrateur principal a accès à TOUS les tools
- **Sub-agents** : Chaque sub-agent a accès uniquement à ses tools assignés
- **Évolution** : Cette distribution peut être ajustée selon les besoins
- **Sécurité** : Les sub-agents ne peuvent pas contourner ces restrictions
