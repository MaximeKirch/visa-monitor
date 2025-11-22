const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

// --- CONFIGURATION DES CIBLES ---
const TARGETS = [
  {
    name: 'FRANÇAIS 🇫🇷',
    url: 'https://swap.ca/fr/products/canada-ro-nomination-whv',
    file: 'last_fingerprint_fr.txt'
  },
  {
    name: 'ANGLAIS 🇬🇧',
    url: 'https://swap.ca/products/canada-ro-nomination-whv',
    file: 'last_fingerprint_en.txt'
  }
];

async function checkAllSites() {
  // Si mode test, on envoie juste un mail et on quitte
  if (process.env.FORCE_EMAIL === 'true') {
    await sendNotification('TEST', 'TEST MANUEL GLOBAL REUSSI');
    return;
  }

  // On boucle sur chaque site (l'un après l'autre)
  for (const site of TARGETS) {
    await checkOneSite(site);
  }
}

async function checkOneSite(site) {
  const filePath = path.join(__dirname, site.file);
  
  try {
    console.log(`🔍 [${site.name}] Analyse en cours...`);
    
    const response = await axios.get(site.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);

    // --- 1. SURVEILLANCE DU SCRIPT "ANDREA EDIT" (Universel) ---
    let scriptContent = "SCRIPT NON TROUVÉ";
    $('script').each((i, el) => {
      const content = $(el).html() || "";
      if (content.includes('const redirects = {') && content.includes('canada-ro-nomination-whv')) {
        scriptContent = content.replace(/\s+/g, ' ').trim();
        return false;
      }
    });

    // --- 2. SURVEILLANCE TEXTE (FR: Mise à jour / EN: Update) ---
    let updateText = "Section info non trouvée";
    // On cherche large pour couvrir les deux langues
    $('h3, h4, p, strong').each((i, el) => {
      const t = $(el).text().toLowerCase();
      if (t.includes('mise à jour') || t.includes('update')) {
        updateText = $(el).text().trim() + ' -> ' + $(el).next().text().trim();
        return false;
      }
    });

    // --- 3. SIGNATURE ---
    const currentFingerprint = `
    --- SCRIPT ---
    Hash: ${scriptContent.substring(0, 50)}...
    Longueur: ${scriptContent.length} chars
    --- INFO ---
    ${updateText}
    `;

    // --- 4. COMPARAISON ---
    let lastFingerprint = '';
    if (fs.existsSync(filePath)) {
      lastFingerprint = fs.readFileSync(filePath, 'utf8');
    }

    const normalize = (str) => str.replace(/\s+/g, ' ').trim();

    if (normalize(currentFingerprint) !== normalize(lastFingerprint)) {
      console.log(`🚨 [${site.name}] CHANGEMENT DÉTECTÉ !`);
      fs.writeFileSync(filePath, currentFingerprint);

      if (lastFingerprint !== '') {
        await sendNotification(
          site.name, 
          `Changement détecté sur la version ${site.name} !\n\n${currentFingerprint}`,
          site.url
        );
      } else {
        console.log(`✅ [${site.name}] Initialisation terminée.`);
      }
    } else {
      console.log(`✅ [${site.name}] R.A.S.`);
    }

  } catch (error) {
    console.error(`❌ Erreur sur ${site.name} :`, error.message);
  }
}

async function sendNotification(siteName, msg, url) {
  const destinataires = process.env.RECIPIENTS || process.env.GMAIL_USER;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: destinataires,
    subject: `🚨 SWAP ALERTE (${siteName})`,
    text: `${msg}\n\nLIEN : ${url || 'N/A'}`
  });
  console.log('Mail envoyé.');
}

checkAllSites();