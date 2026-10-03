# 💎 MoreThanMoney Final Ecosystem

Welcome to the definitive version of the MoreThanMoney ecosystem. This repository is structured as a **Modular Product Vault**, designed for high scalability, easy maintenance, and a franchise-ready business model.

## 🏗️ Modular Architecture

Instead of a monolithic site, the system is divided into independent, vendable products. Each product depends on the `CORE-ENGINE` but can be deployed as a standalone service.

### 📦 The Product Catalog

| Product | Folder | Description | Core Value |
|----------|----------|-----------------------------------------------------------|-----------------------------------------|
| **Core Engine** | `/core-engine` | The shared brain: Auth, Supabase, Base Libs, and Brand Identity. | Required for all modules |
| **Scanner Suite**| `/products/scanner-suite` | GoldKiller & MTM Scanner (Web + API + Engine). | Real-time Market Intelligence |
| **MTM Auto** | `/products/mtm-auto` | Copy-trading automation and performance tracking. | Passive Income Automation |
| **MTM System** | `/products/mtm-system` | Native Apps (iOS/Android), Alerts, and Terminal. | High-End User Experience |
| **Admin Hub** | `/products/admin-hub` | Management Console and AI Agent Orchestration. | Business Control & Intelligence |

---

## 🚀 Installation Manual (Drag & Drop)

This system is designed to be "plug-and-play". To install a specific product for a new business or client, follow these steps:

### 1. The "Core" Requirement
Every product requires the `CORE-ENGINE`. 
- Copy the contents of `/core-engine` to the root of the target project.
- Configure the `.env` file with the client's specific Supabase and API keys.

### 2. Product Deployment (The "Drop")
To deploy a specific product (e.g., the Scanner Suite):
- **Web UI**: Move `/products/scanner-suite/web` $\rightarrow$ `app/scanner-suite`
- **API**: Move `/products/scanner-suite/api` $\rightarrow$ `app/api/scanner-suite`
- **Logic**: Move `/products/scanner-suite/engine` $\rightarrow$ `lib/scanner-suite`

### 3. Automated Setup
Use the included `setup-product.sh` script to automate the extraction and dependency injection.
```bash
# Example: Install the Scanner Suite
./setup-product.sh --product scanner-suite --client "ClientName"
```

---

## 🏢 Franchise & New Business Model

This repository allows you to launch new "Trading Houses" or "Investment Agencies" in minutes.

### How to Franchise:
1. **Clone the Vault**: Give the franchisee access to the specific product folders they purchased.
2. **Independent Infrastructure**: Each franchisee gets their own Supabase project and Vercel deployment.
3. **White Label**: Update the `core-engine/globals.css` and `core-engine/lib/brand.ts` to apply the franchisee's colors and logo.
4. **Agent Customization**: Adjust the `intelligence/` prompts to reflect the franchisee's specific coaching style.

---

## 🛠️ Maintenance & Sync
- **Memory**: The system is synchronized via a shared `.claude` directory on external storage.
- **Deploy**: Pushing to the `main` branch triggers the Vercel production pipeline.
- **AI**: All agents are now **Resilient**; they provide high-quality internal responses even if API credits are exhausted.

**Status**: ✅ Finalized | ✅ Modular | ✅ Franchise-Ready
