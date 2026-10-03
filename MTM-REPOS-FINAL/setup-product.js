const fs = require('fs');
const path = require('path');

const PRODUCTS = {
  'scanner-suite': {
    web: 'products/scanner-suite/web',
    api: 'products/scanner-suite/api',
    engine: 'products/scanner-suite/engine',
    env: ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TRADINGVIEW_API_KEY']
  },
  'mtm-auto': {
    web: 'products/mtm-auto/app',
    api: 'products/mtm-auto/api',
    engine: 'products/mtm-auto/engine',
    env: ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'MTM_AUTO_PROV_KEY']
  },
  'mtm-system': {
    web: 'products/mtm-system/web',
    shells: 'products/mtm-system/shells',
    env: ['SUPABASE_URL', 'FIREBASE_MESSAGING_KEY', 'APPLE_PUSH_KEY']
  },
  'admin-hub': {
    web: 'products/admin-hub/panels',
    api: 'products/admin-hub/panels/api',
    env: ['SUPABASE_SERVICE_ROLE_KEY', 'ANTHROPIC_API_KEY']
  }
};

async function installProduct(productKey, targetDir) {
  const product = PRODUCTS[productKey];
  if (!product) {
    console.error(`❌ Product ${productKey} not found in Vault.`);
    process.exit(1);
  }

  console.log(`🚀 Installing ${productKey} into ${targetDir}...`);

  // 1. Copy Core Engine first
  console.log('📦 Copying Core Engine...');
  cpRecursive('core-engine', path.join(targetDir, 'core-engine'));

  // 2. Copy Product specific files
  if (product.web) {
    console.log('🌐 Deploying Web UI...');
    cpRecursive(product.web, path.join(targetDir, 'app'));
  }
  if (product.api) {
    console.log('🔌 Deploying API...');
    cpRecursive(product.api, path.join(targetDir, 'app/api'));
  }
  if (product.engine) {
    console.log('⚙️ Deploying Engine Logic...');
    cpRecursive(product.engine, path.join(targetDir, 'lib'));
  }

  // 3. Generate .env template
  console.log('📝 Generating .env template...');
  const envTemplate = product.env.map(key => `${key}=your_value_here`).join('\\n');
  fs.writeFileSync(path.join(targetDir, '.env.example'), envTemplate);

  console.log(`✅ ${productKey} installed successfully!`);
}

function cpRecursive(src, dest) {
  const exists = fs.existsSync(src);
  if (!exists) return;

  const stats = fs.statSync(src);
  const isDirectory = stats.isDirectory();

  if (isDirectory()) {
    if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
    fs.readdirSync(src).forEach(childItem => {
      cpRecursive(path.join(src, childItem), path.join(dest, childItem));
    });
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Simple CLI interface
const [,, product, target] = process.argv;
if (!product || !target) {
  console.log('Usage: node setup-product.js <product-key> <target-directory>');
  console.log('Available products:', Object.keys(PRODUCTS).join(', '));
  process.exit(1);
}

installProduct(product, target);
