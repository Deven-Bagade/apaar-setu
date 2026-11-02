// "How to use this page" steps shown at the top of every page (English + Hindi).
export const GUIDES = {
  'dash-admin': {
    en: ['The tiles at the top are national totals for the current academic year. Click any tile to open the matching page.', 'Click a state on the India map to filter the charts and the institution list below it.', '"Inspect first" lists the colleges with the lowest Trust Score. Open one to see why.', 'Run the Ghost Student Radar after big uploads to refresh flags.'],
    hi: ['ऊपर की टाइलें इस शैक्षणिक वर्ष के राष्ट्रीय आँकड़े हैं। किसी टाइल पर क्लिक करके संबंधित पेज खोलें।', 'नीचे के चार्ट फ़िल्टर करने के लिए भारत के नक्शे पर किसी राज्य पर क्लिक करें।', '"पहले निरीक्षण करें" सूची में सबसे कम ट्रस्ट स्कोर वाले कॉलेज हैं।', 'बड़े अपलोड के बाद घोस्ट छात्र रडार चलाएँ।'],
  },
  'dash-inst': {
    en: ['"To do" shows what needs your attention: batches to submit, rows to fix, flags to answer.', 'Each programme bar shows regular seats used against approved intake. Supernumerary pools are counted separately.', 'Use Upload to add students, then open the batch and Sign & submit it to AICTE.', 'Your Trust Score improves as you fix rejected rows and resolve flags.'],
    hi: ['"करने योग्य" में वे काम हैं जिन पर ध्यान देना है: जमा करने वाले बैच, सुधारने वाली पंक्तियाँ, जवाब देने वाले फ़्लैग।', 'हर प्रोग्राम बार स्वीकृत इनटेक के मुकाबले भरी नियमित सीटें दिखाता है।', 'छात्र जोड़ने के लिए अपलोड का उपयोग करें, फिर बैच खोलकर AICTE को हस्ताक्षर करके जमा करें।', 'अस्वीकृत पंक्तियाँ सुधारने और फ़्लैग हल करने से ट्रस्ट स्कोर बढ़ता है।'],
  },
  institutions: {
    en: ['Search by name, city or AICTE ID, or filter by state.', 'Trust band colours: green High, yellow Fair, orange Watch, red Risk.', 'Click a row to open the institution: programmes, seat use, flags, batches and trust breakdown.'],
    hi: ['नाम, शहर या AICTE आईडी से खोजें, या राज्य से फ़िल्टर करें।', 'ट्रस्ट रंग: हरा उच्च, पीला ठीक, नारंगी निगरानी, लाल जोखिम।', 'संस्थान का पूरा विवरण देखने के लिए पंक्ति पर क्लिक करें।'],
  },
  ledger: {
    en: ['Choose a programme. Every approved seat is a numbered slot: W = within intake, T = TFW, F = FN/OCI/PIO/CIWGC, P = PMSSS, L = lateral entry.', 'Green = occupied, red = on hold for review, striped = free. Click a seat to see who holds it.', 'Use "Try to admit" to test what happens when a college admits one more student than allowed: the ledger blocks it.', 'The timeline below lists every occupy, vacate, hold and blocked attempt, so AICTE can replay admissions day by day.'],
    hi: ['प्रोग्राम चुनें। हर स्वीकृत सीट एक क्रमांकित स्लॉट है: W = इनटेक के भीतर, T = TFW, F = FN/OCI, P = PMSSS, L = लेटरल।', 'हरा = भरी, लाल = समीक्षा हेतु रोकी गई, धारीदार = खाली। सीट पर क्लिक करके छात्र देखें।', '"प्रवेश का प्रयास करें" से देखें कि सीमा से अधिक प्रवेश पर क्या होता है: लेजर रोक देता है।', 'नीचे की टाइमलाइन हर घटना दिखाती है।'],
  },
  students: {
    en: ['Search by name, APAAR ID or roll number. Use the filters for programme, category, status and record state.', 'Record state shows where a record is in the pipeline: APAAR-verified → Ledger-accepted (submitted) → AICTE-verified.', 'Click a student to view details, correct data, withdraw, graduate or issue a credential.'],
    hi: ['नाम, APAAR आईडी या रोल नंबर से खोजें।', 'रिकॉर्ड स्थिति बताती है कि रिकॉर्ड पाइपलाइन में कहाँ है।', 'विवरण, सुधार, निकासी या क्रेडेंशियल के लिए छात्र पर क्लिक करें।'],
  },
  upload: {
    en: ['Excel: download the template, fill one row per student, then drop the file here. Errors are shown before anything is sent.', 'Form: add one student at a time; every field explains what it needs.', 'After upload, every row is checked against the ABC registry and the Seat Ledger. Rejected rows get a reason code and can be fixed in the batch.', 'Finally the Institution Admin opens the batch and clicks Sign & submit.'],
    hi: ['Excel: टेम्पलेट डाउनलोड करें, हर छात्र की एक पंक्ति भरें, फिर फ़ाइल यहाँ डालें। भेजने से पहले गलतियाँ दिखेंगी।', 'फ़ॉर्म: एक-एक छात्र जोड़ें।', 'अपलोड के बाद हर पंक्ति ABC रजिस्ट्री और सीट लेजर से जाँची जाती है।', 'अंत में संस्थान एडमिन बैच खोलकर हस्ताक्षर करके जमा करते हैं।'],
  },
  batches: {
    en: ['Each upload creates a batch. Status moves Draft → Submitted (signed by the college) → AICTE-verified.', 'Open a batch to see accepted, held and rejected rows. Fix rejected rows in place and re-check them.', 'Institution Admin: Sign & submit. AICTE / Regional Officer: verify the signature and approve.'],
    hi: ['हर अपलोड एक बैच बनाता है: ड्राफ्ट → जमा (हस्ताक्षरित) → AICTE-सत्यापित।', 'अस्वीकृत पंक्तियाँ वहीं सुधारें और दोबारा जाँचें।', 'संस्थान एडमिन जमा करते हैं; AICTE हस्ताक्षर जाँचकर स्वीकृत करता है।'],
  },
  radar: {
    en: ['The Radar looks across all colleges at once for patterns a single college cannot see.', 'Pick a flag type to draw its network: students (yellow), colleges (red squares), shared phones (orange) and bank accounts (green).', 'Every flag carries a plain-language reason. Open it in Flags to review, resolve or dismiss.'],
    hi: ['रडार एक साथ सभी कॉलेजों में ऐसे पैटर्न खोजता है जो एक कॉलेज नहीं देख सकता।', 'फ़्लैग प्रकार चुनकर नेटवर्क देखें।', 'हर फ़्लैग में सरल भाषा में कारण है।'],
  },
  flags: {
    en: ['Severity: Hold = record frozen until resolved; Flag = needs review.', 'Click a flag to read why it was raised and see the records involved.', 'AICTE / Regional Officer: Start review, then Resolve or Dismiss with a note. Institutions can add a response.'],
    hi: ['होल्ड = हल होने तक रिकॉर्ड रुका; फ़्लैग = समीक्षा आवश्यक।', 'कारण और संबंधित रिकॉर्ड देखने के लिए फ़्लैग पर क्लिक करें।', 'AICTE समीक्षा करके हल या खारिज करता है; संस्थान उत्तर जोड़ सकते हैं।'],
  },
  inspection: {
    en: ['Colleges are ranked by Trust Score, lowest first, with the reasons that pulled the score down.', 'Tick colleges and schedule an inspection with a date and officer.', 'Risk-based inspection means officers visit the riskiest 5–10% instead of a random sample.'],
    hi: ['कॉलेज ट्रस्ट स्कोर के अनुसार क्रमबद्ध हैं, सबसे कम पहले।', 'कॉलेज चुनकर निरीक्षण की तारीख तय करें।', 'जोखिम आधारित निरीक्षण।'],
  },
  trust: {
    en: ['Your score is out of 100 and made of five parts. Each part shows what was measured.', 'Follow the tips in orange to raise the score.', 'Open institution-level anomalies cap the score, so resolving them matters most.'],
    hi: ['आपका स्कोर 100 में से है और पाँच भागों से बना है।', 'स्कोर बढ़ाने के लिए नारंगी सुझावों का पालन करें।', 'संस्थान स्तर की विसंगतियाँ स्कोर को सीमित करती हैं।'],
  },
  scholarships: {
    en: ['Claims come from the scholarship portals (mock NSP feed). Each claim is matched to a seat in the ledger.', 'Red rows have no valid seat: ghost student, withdrawn student, duplicate claim or seat on hold.', 'Withhold payment for red rows; release once the institution explains.'],
    hi: ['दावे छात्रवृत्ति पोर्टल से आते हैं और लेजर की सीट से मिलाए जाते हैं।', 'लाल पंक्तियों की कोई वैध सीट नहीं है।', 'लाल पंक्तियों का भुगतान रोकें।'],
  },
  lifecycle: {
    en: ['Each programme gets a dropout risk from this term’s withdrawals, the 3-year average and the trend.', 'High-risk programmes are listed first with the reasons.', 'Institution Admin: promote a whole programme to the next semester in one click.'],
    hi: ['हर प्रोग्राम का ड्रॉपआउट जोखिम दिखाया गया है।', 'उच्च जोखिम वाले प्रोग्राम पहले हैं।', 'संस्थान एडमिन पूरे प्रोग्राम को अगले सेमेस्टर में बढ़ा सकते हैं।'],
  },
  reports: {
    en: ['Pick a report. A preview opens below.', 'Export to Excel or CSV, or print / save as PDF.', 'NBA, NAAC and NIRF formats are built from the same verified data, so colleges upload once and reuse it.'],
    hi: ['रिपोर्ट चुनें, नीचे पूर्वावलोकन खुलेगा।', 'Excel/CSV में निर्यात करें या प्रिंट करें।', 'NBA, NAAC और NIRF प्रारूप उसी सत्यापित डेटा से बनते हैं।'],
  },
  certificates: {
    en: ['Choose a student. Graduated students get a degree certificate; current students get an enrolment (bonafide) certificate.', 'The certificate prints the APAAR ID, your student ID and a signed QR code.', 'Anyone can scan the QR with the Verify page, even offline, and see only the details printed on the certificate.'],
    hi: ['छात्र चुनें। उत्तीर्ण छात्र को डिग्री प्रमाणपत्र, वर्तमान छात्र को नामांकन प्रमाणपत्र।', 'प्रमाणपत्र पर APAAR आईडी, छात्र आईडी और हस्ताक्षरित QR छपता है।', 'कोई भी QR स्कैन करके ऑफ़लाइन भी सत्यापित कर सकता है।'],
  },
  audit: {
    en: ['Every change is an entry in a hash chain: each entry contains the hash of the one before it.', 'Click "Verify chain" to recompute every hash. Any edited entry breaks the chain at that point.', 'Daily Merkle roots are published; a back-dated edit changes the root. Try "Simulate tampering" to see it.'],
    hi: ['हर बदलाव हैश चेन में दर्ज होता है।', '"चेन सत्यापित करें" पर क्लिक करें; कोई भी बदली गई प्रविष्टि चेन तोड़ देती है।', 'दैनिक मर्कल रूट प्रकाशित होते हैं। "छेड़छाड़ का अनुकरण" आज़माएँ।'],
  },
  users: {
    en: ['Add people and give each one role. The role decides what they can see and do.', 'Institution Admins can add Data Clerks for their own college only.', 'Deactivate accounts of people who leave; their past actions stay in the audit trail.'],
    hi: ['लोगों को जोड़ें और भूमिका दें।', 'संस्थान एडमिन केवल अपने कॉलेज के लिए क्लर्क जोड़ सकते हैं।', 'जाने वाले लोगों के खाते निष्क्रिय करें।'],
  },
  rules: {
    en: ['These caps and thresholds drive the Seat Ledger and the Radar.', 'Change a value and save; every change is written to the audit trail.', 'Confirm caps against the current AICTE Approval Process Handbook before changing them.'],
    hi: ['ये सीमाएँ सीट लेजर और रडार चलाती हैं।', 'मान बदलकर सहेजें; हर बदलाव ऑडिट में दर्ज होता है।', 'बदलने से पहले AICTE हैंडबुक से पुष्टि करें।'],
  },
  api: {
    en: ['Pick an endpoint on the left. A sample request body is filled in.', 'Click Send. The request runs with your role’s permissions, exactly as a college ERP would call it.', 'Use the registry browser to find APAAR IDs you can test with. Download the OpenAPI spec for your developers.'],
    hi: ['बाईं ओर एंडपॉइंट चुनें।', 'भेजें पर क्लिक करें। अनुरोध आपकी भूमिका की अनुमतियों से चलता है।', 'परीक्षण के लिए रजिस्ट्री ब्राउज़र का उपयोग करें।'],
  },
  me: {
    en: ['This is your admission record as AICTE sees it.', 'The steps show how far your record has been verified.', 'If something is wrong, ask your college to correct it; every correction is logged.'],
    hi: ['यह आपका प्रवेश रिकॉर्ड है जैसा AICTE देखता है।', 'चरण बताते हैं कि रिकॉर्ड कितना सत्यापित हुआ।', 'कोई गलती हो तो कॉलेज से सुधार करवाएँ।'],
  },
  credentials: {
    en: ['Your credential is signed by AICTE. Choose which details to share using the checkboxes.', 'The QR code and link carry only the ticked details; the rest stay hidden but provably part of the signed credential.', 'Show the QR to an employer or send the link. It can be verified offline.'],
    hi: ['आपका क्रेडेंशियल AICTE द्वारा हस्ताक्षरित है। चेकबॉक्स से चुनें क्या साझा करना है।', 'QR और लिंक में केवल चुनी गई जानकारी होती है।', 'QR नियोक्ता को दिखाएँ या लिंक भेजें।'],
  },
  consent: {
    en: ['Requests from employers or regulators wait here. You can untick fields you do not want to share.', 'Allow gives access for the number of days shown. You can revoke any time.', 'Every time someone opens your data it appears under "Who viewed my data".'],
    hi: ['नियोक्ता या नियामकों के अनुरोध यहाँ हैं। जो साझा नहीं करना उसे हटा दें।', 'अनुमति दिखाए गए दिनों के लिए है; कभी भी वापस लें।', 'हर बार डेटा देखने पर वह "मेरा डेटा किसने देखा" में दिखता है।'],
  },
  access: {
    en: ['Every view of your record by anyone outside your college is listed here, with purpose and legal basis.', 'Regulators may view under law (AICTE Act); employers only with your consent.'],
    hi: ['आपके रिकॉर्ड का हर उपयोग यहाँ उद्देश्य सहित दिखता है।', 'नियामक कानून के तहत देख सकते हैं; नियोक्ता केवल आपकी सहमति से।'],
  },
  verify: {
    en: ['Scan the QR on a certificate with your camera, upload a photo of it, or paste the link or code.', 'The check runs in your browser using AICTE’s public key; it works without internet.', 'Green means the details shown were signed by AICTE and have not been changed.'],
    hi: ['प्रमाणपत्र का QR कैमरे से स्कैन करें, फ़ोटो अपलोड करें या लिंक चिपकाएँ।', 'जाँच आपके ब्राउज़र में AICTE की सार्वजनिक कुंजी से होती है; इंटरनेट की ज़रूरत नहीं।', 'हरा = जानकारी AICTE द्वारा हस्ताक्षरित और अपरिवर्तित।'],
  },
  requests: {
    en: ['Enter the student’s APAAR ID, what you need and why. The student decides.', 'Once allowed, open the record from the list. Each opening is logged and visible to the student.', 'Access expires automatically after the number of days you asked for.'],
    hi: ['छात्र की APAAR आईडी, आवश्यक जानकारी और कारण लिखें। निर्णय छात्र का है।', 'अनुमति मिलने पर सूची से रिकॉर्ड खोलें।', 'पहुँच स्वतः समाप्त हो जाती है।'],
  },
  inbox: {
    en: ['These are the WhatsApp / SMS / in-app messages the platform sent to you or your institution.', 'Messages with a red edge are unread. Click a message link to open the related page.'],
    hi: ['ये प्लेटफ़ॉर्म द्वारा भेजे गए संदेश हैं।', 'लाल किनारे वाले संदेश अपठित हैं।'],
  },
};
