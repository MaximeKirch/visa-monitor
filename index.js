const axios = require('axios');
const cheerio = require('cheerio');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');

const URL = 'https://swap.ca/fr/products/canada-ro-nomination-whv';
const FILE_PATH = path.join(__dirname, 'last_fingerprint.txt');

async function checkAndreaScript() {
  try {
    if (process.env.FORCE_EMAIL === 'true') {
      await sendNotification('TEST : Surveillance du Script de redirection active.');
      return;
    }

    console.log('🔍 Analyse du code source...');
    const response = await axios.get(URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36' }
    });
    const $ = cheerio.load(response.data);

    // --- 1. SURVEILLANCE DU SCRIPT "ANDREA EDIT" ---
    // C'est votre découverte : on cherche le script qui contient la logique de redirection
    let scriptContent = "SCRIPT NON TROUVÉ";
    
    $('script').each((i, el) => {
      const content = $(el).html() || "";
      // On cherche le script qui contient la liste des redirections
      if (content.includes('const redirects = {') && content.includes('canada-ro-nomination-whv')) {
        // On nettoie le script pour enlever les espaces inutiles et n'avoir que le code pur
        scriptContent = content.replace(/\s+/g, ' ').trim();
        return false; // On arrête dès qu'on l'a trouvé
      }
    });

    // --- 2. SURVEILLANCE DU TEXTE "MISE À JOUR" (Backup) ---
    // On garde ça car c'est utile pour les infos humaines
    let updateText = "Section info non trouvée";
    $('h3, h4, p, strong').each((i, el) => {
      const t = $(el).text().toLowerCase();
      if (t.includes('mise à jour') || t.includes('update')) {
        updateText = $(el).text().trim() + ' -> ' + $(el).next().text().trim();
        return false;
      }
    });

    // --- 3. CRÉATION DE LA SIGNATURE ---
    // Si Andrea ajoute l'URL dans le script, cette signature va changer radicalement.
    const currentFingerprint = `
    --- SCRIPT DE REDIRECTION ---
    ${scriptContent.substring(0, 200)}... (Code hashé pour suivi)
    Longueur du script: ${scriptContent.length} caractères
    
    --- SECTION INFO ---
    ${updateText}
    `;

    console.log('Signature actuelle générée.');

    // --- 4. COMPARAISON ---
    let lastFingerprint = '';
    if (fs.existsSync(FILE_PATH)) {
      lastFingerprint = fs.readFileSync(FILE_PATH, 'utf8');
    }

    // Fonction simple pour normaliser (ignorer les petits espaces)
    const normalize = (str) => str.replace(/\s+/g, ' ').trim();

    if (normalize(currentFingerprint) !== normalize(lastFingerprint)) {
      console.log('🚨 CHANGEMENT DANS LE CODE OU LE TEXTE !');
      
      // On sauvegarde
      fs.writeFileSync(FILE_PATH, currentFingerprint);

      // On alerte (sauf si c'est la première fois)
      if (lastFingerprint !== '') {
        // On analyse vite fait pourquoi ça a changé pour le mail
        let subject = '🚨 SWAP ALERTE : ';
        if (scriptContent.length !== (lastFingerprint.match(/Longueur du script: (\d+)/)?.[1] || 0)) {
            subject += 'LE SCRIPT A CHANGÉ (Lien ajouté ?)';
        } else {
            subject += 'INFO MISE À JOUR';
        }

        await sendNotification(`Le code de la page a changé !\nProbablement l'ajout du lien de redirection.\n\n${currentFingerprint}`, subject);
      } else {
        console.log('Initialisation terminée. Script repéré.');
      }
    } else {
      console.log('✅ R.A.S. (Le script de redirection est identique).');
    }

  } catch (error) {
    console.error(error);
  }
}

async function sendNotification(msg, subjectLine) {
  const destinataires = process.env.RECIPIENTS || process.env.GMAIL_USER;
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
  });

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: process.env.GMAIL_USER,
    bcc: destinataires,
    subject: subjectLine || '🚨 SWAP CANADA : UPDATE !',
    text: `${msg}\n\nGO GO GO : ${URL}`
  });
  console.log('Mail envoyé.');
}

checkAndreaScript();