// Lightweight i18n: English, Hindi, Marathi for navigation, titles and common actions.
import { useSyncExternalStore } from 'react';

const DICT = {
  en: {},
  hi: {
    Dashboard: 'डैशबोर्ड', Institutions: 'संस्थान', 'Seat Ledger': 'सीट लेजर', Students: 'छात्र', Upload: 'अपलोड', Batches: 'बैच',
    'Ghost Student Radar': 'घोस्ट छात्र रडार', Flags: 'फ़्लैग', 'Inspection planner': 'निरीक्षण योजना', 'Trust score': 'ट्रस्ट स्कोर',
    Scholarships: 'छात्रवृत्ति', Lifecycle: 'जीवनचक्र', Reports: 'रिपोर्ट', Certificates: 'प्रमाणपत्र', 'Audit trail': 'ऑडिट ट्रेल',
    Users: 'उपयोगकर्ता', 'Rules & settings': 'नियम और सेटिंग', 'API sandbox': 'एपीआई सैंडबॉक्स', Inbox: 'इनबॉक्स', Help: 'सहायता',
    'My record': 'मेरा रिकॉर्ड', 'My credentials': 'मेरे क्रेडेंशियल', Consent: 'सहमति', 'Who viewed my data': 'मेरा डेटा किसने देखा',
    'Verify a credential': 'क्रेडेंशियल सत्यापित करें', 'Access requests': 'एक्सेस अनुरोध', Transparency: 'पारदर्शिता', Profile: 'प्रोफ़ाइल',
    'Sign in': 'साइन इन', 'Sign out': 'साइन आउट', Search: 'खोजें', Save: 'सहेजें', Cancel: 'रद्द करें', Submit: 'जमा करें', Close: 'बंद करें',
    'How to use this page': 'इस पेज का उपयोग कैसे करें', Monitor: 'निगरानी', Records: 'रिकॉर्ड', Integrity: 'अखंडता', Output: 'आउटपुट', Admin: 'प्रशासन',
    'Ask Setu Sahayak': 'सेतु सहायक से पूछें', 'Type your question…': 'अपना प्रश्न लिखें…', Send: 'भेजें', Language: 'भाषा',
    'Demo mode': 'डेमो मोड', 'All India': 'संपूर्ण भारत', Download: 'डाउनलोड', 'Open': 'खोलें', 'Hide': 'छिपाएँ', 'Show': 'दिखाएँ',
    'Home': 'होम', 'Account': 'खाता', 'Student': 'छात्र', 'Verifier': 'सत्यापनकर्ता',
  },
  mr: {
    Dashboard: 'डॅशबोर्ड', Institutions: 'संस्था', 'Seat Ledger': 'सीट लेजर', Students: 'विद्यार्थी', Upload: 'अपलोड', Batches: 'बॅच',
    'Ghost Student Radar': 'घोस्ट विद्यार्थी रडार', Flags: 'फ्लॅग', 'Inspection planner': 'तपासणी नियोजन', 'Trust score': 'विश्वास गुण',
    Scholarships: 'शिष्यवृत्ती', Lifecycle: 'जीवनचक्र', Reports: 'अहवाल', Certificates: 'प्रमाणपत्रे', 'Audit trail': 'ऑडिट ट्रेल',
    Users: 'वापरकर्ते', 'Rules & settings': 'नियम व सेटिंग्ज', 'API sandbox': 'एपीआय सँडबॉक्स', Inbox: 'इनबॉक्स', Help: 'मदत',
    'My record': 'माझे रेकॉर्ड', 'My credentials': 'माझी क्रेडेन्शियल्स', Consent: 'संमती', 'Who viewed my data': 'माझा डेटा कोणी पाहिला',
    'Verify a credential': 'क्रेडेन्शियल पडताळा', 'Access requests': 'प्रवेश विनंत्या', Transparency: 'पारदर्शकता', Profile: 'प्रोफाइल',
    'Sign in': 'साइन इन', 'Sign out': 'साइन आउट', Search: 'शोधा', Save: 'जतन करा', Cancel: 'रद्द करा', Submit: 'सादर करा', Close: 'बंद करा',
    'How to use this page': 'हे पान कसे वापरावे', Monitor: 'देखरेख', Records: 'नोंदी', Integrity: 'अखंडता', Output: 'आउटपुट', Admin: 'प्रशासन',
    'Ask Setu Sahayak': 'सेतू सहायकला विचारा', 'Type your question…': 'तुमचा प्रश्न लिहा…', Send: 'पाठवा', Language: 'भाषा',
    'Demo mode': 'डेमो मोड', 'All India': 'संपूर्ण भारत', Download: 'डाउनलोड', 'Open': 'उघडा', 'Hide': 'लपवा', 'Show': 'दाखवा',
    'Home': 'मुख्यपृष्ठ', 'Account': 'खाते', 'Student': 'विद्यार्थी', 'Verifier': 'पडताळणीकर्ता',
  },
};
export const LANGS = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

let lang = localStorage.getItem('apaar-setu-lang') || 'en';
const subs = new Set();
export function setLang(l) {
  lang = l;
  localStorage.setItem('apaar-setu-lang', l);
  document.documentElement.lang = l;
  subs.forEach((f) => f());
}
export const getLang = () => lang;
export const t = (s) => DICT[lang]?.[s] || s;
export function useLang() {
  useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    () => lang,
  );
  return { lang, t };
}
