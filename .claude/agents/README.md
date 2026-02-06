# Agents Library - Collection Complete

> Dossier portable contenant tous les agents. Copiez ce dossier dans n'importe quel projet.

## Installation dans un autre projet

```bash
cp -r .claude/agents_library /votre-projet/.claude/agents/
```

## Contenu (26 agents)

### Fichiers Speciaux
| Fichier | Description |
|---------|-------------|
| `agents_supreme.md` | Catalogue complet avec index et matrice de selection |
| `agent_controle.md` | Meta-agent pour choisir le bon agent |

### Code & Developpement (8)
| Agent | Modele | Usage |
|-------|--------|-------|
| `backend-architect.md` | sonnet | APIs REST, microservices, schemas DB |
| `code-reviewer.md` | sonnet | Review code qualite/securite |
| `debugger.md` | sonnet | Analyse erreurs, stack traces |
| `explore-code.md` | sonnet | Exploration codebase, recherche patterns |
| `explore-style.md` | sonnet | Analyse style code, conventions |
| `frontend-developer.md` | sonnet | React, CSS, UI responsive |
| `fullstack-developer.md` | opus | Projets complets front+back |
| `test-code.md` | sonnet | Tests specifiques code |
| `test-engineer.md` | sonnet | Tests unitaires, integration, e2e |

### AI & Prompts (6)
| Agent | Modele | Usage |
|-------|--------|-------|
| `prompt-engineer.md` | opus | Optimisation prompts LLM |
| `mcp-creator.md` | sonnet | Creation serveurs MCP |
| `mcp-doctor.md` | sonnet | Diagnostic/fix MCP |
| `mcp-expert.md` | sonnet | Configurations MCP |
| `mcp-server-architect.md` | sonnet | Architecture serveurs MCP |
| `mcp-testing-engineer.md` | sonnet | Tests integrations MCP |

### Design & Media (2)
| Agent | Modele | Usage |
|-------|--------|-------|
| `ui-ux-designer.md` | sonnet | Wireframes, design systems |
| `video-editor.md` | opus | Montage video, FFmpeg |

### Marketing & SEO (3)
| Agent | Modele | Usage |
|-------|--------|-------|
| `content-marketer.md` | sonnet | Blog, social media, email |
| `seo-analyzer.md` | sonnet | Audit SEO technique |
| `seo-podcast-optimizer.md` | sonnet | SEO pour podcasts |

### Legal (1)
| Agent | Modele | Usage |
|-------|--------|-------|
| `legal-advisor.md` | opus | Privacy, ToS, GDPR |

### Workflow & Orchestration (5)
| Agent | Modele | Usage |
|-------|--------|-------|
| `apex-workflow.md` | sonnet | **PRINCIPAL** - Workflow 3 etapes (/analyze, /plan, /implement) |
| `context-manager.md` | opus | Gestion contexte multi-agents |
| `epct.md` | opus | Chain-of-thought expert |
| `moana-epct.md` | opus | Variante EPCT |
| `agent_controle.md` | opus | Selection et orchestration |

## Utilisation Rapide

### Via Claude Code CLI
```bash
# Invoquer un agent
claude "utilise l'agent code-reviewer pour analyser mon code"
```

### Via Task Tool
```python
Task(
    subagent_type="code-reviewer",
    prompt="Review le fichier app.py"
)
```

## Maintenance

- **Mise a jour:** Remplacez les fichiers individuels
- **Ajout:** Copiez le nouveau .md dans ce dossier
- **Suppression:** Supprimez le fichier .md

---

*Collection maintenue par Claude Opus 4.5*
*Version: 1.1 - 2026-01-02*
*Total: 26 agents (dont apex-workflow) + 2 fichiers speciaux*
