# Templates

Ce dossier contient des templates JSON pré-validés pour les blocs Gutenberg complexes.

## Structure

- **nectar-blocks/** - Templates pour NectarBlocks (blocs premium avec 100+ attributs)
- **core/** - Templates pour les blocs WordPress core
- **custom/** - Templates personnalisés pour d'autres plugins ou blocs custom

## Format des templates

Chaque template est un fichier JSON avec la structure suivante :

```json
{
  "template_id": "nectar-blocks-hero-default",
  "block_name": "nectar-blocks/hero",
  "name": "Hero Section - Default",
  "description": "Hero section par défaut avec titre, sous-titre et CTA",
  "use_case": "landing-page-hero",
  "validated": true,
  "attributes": {
    "title": "Welcome to Our Site",
    "subtitle": "Discover amazing features",
    "ctaText": "Get Started",
    "backgroundColor": "primary",
    "textColor": "white",
    "layout": "centered",
    // ... autres attributs validés
  },
  "overridable_attributes": [
    "title",
    "subtitle",
    "ctaText"
  ],
  "validation_schema": {
    // JSON Schema pour valider les overrides
  }
}
```

## Utilisation

Les templates permettent à l'agent Claude de :

1. **Créer rapidement** des blocs complexes sans charger 100+ attributs
2. **Éviter les erreurs** en utilisant des configurations pré-validées
3. **Personnaliser** uniquement les attributs essentiels via overrides

## Workflow

1. Agent cherche un template approprié avec `search_block_templates`
2. Si trouvé, utilise `use_block_template` avec overrides optionnels
3. Si non trouvé, utilise progressive disclosure pour découvrir les attributs

## TODO

- Créer templates pour les blocs NectarBlocks les plus utilisés
- Créer templates pour les compositions courantes (hero, features, testimonials, pricing)
- Ajouter des tests de validation pour chaque template
