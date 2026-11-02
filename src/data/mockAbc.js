// Mock of the ABC / APAAR registry API.
// In production this is replaced by calls to the official ABC institutional API
// (same request/response shape as mockAbc.verify below). The registry is generated
// deterministically, so every browser sees the same "national" registry.
import { prng, verhoeffDigit, nameSimilarity } from '../lib/util';

export const MALE = ['Aarav', 'Rahul', 'Vikram', 'Arjun', 'Rohan', 'Siddharth', 'Karan', 'Aditya', 'Nikhil', 'Pranav', 'Yash', 'Harsh', 'Varun', 'Kunal', 'Abhishek', 'Sandeep', 'Manish', 'Suresh', 'Ravi', 'Amit', 'Deepak', 'Gaurav', 'Tushar', 'Omkar', 'Shubham', 'Akash', 'Vivek', 'Mohit', 'Sachin', 'Ankit', 'Dhruv', 'Ishaan', 'Kartik', 'Naveen', 'Prakash', 'Ritesh', 'Tejas', 'Vishal', 'Sameer', 'Imran'];
export const FEMALE = ['Ananya', 'Priya', 'Sneha', 'Pooja', 'Kavya', 'Isha', 'Neha', 'Riya', 'Shreya', 'Aditi', 'Meera', 'Divya', 'Nikita', 'Tanvi', 'Sakshi', 'Anjali', 'Swati', 'Payal', 'Rutuja', 'Bhavna', 'Komal', 'Lakshmi', 'Deepika', 'Pallavi', 'Sana', 'Fatima', 'Harini', 'Keerthi', 'Madhuri', 'Nandini'];
export const LAST = ['Sharma', 'Patil', 'Deshmukh', 'Iyer', 'Reddy', 'Nair', 'Kulkarni', 'Joshi', 'Gupta', 'Verma', 'Singh', 'Yadav', 'Banerjee', 'Chatterjee', 'Das', 'Mehta', 'Shah', 'Patel', 'Rao', 'Naidu', 'Pillai', 'Menon', 'Mishra', 'Tiwari', 'Pandey', 'Khan', 'Shaikh', 'Gowda', 'Hegde', 'Jain', 'Agarwal', 'Bose', 'Ghosh', 'Chauhan', 'Thakur', 'Pawar', 'Jadhav', 'More', 'Kale', 'Murthy'];
const FN_COUNTRIES = ['Nepal', 'Bangladesh', 'Kenya', 'Nigeria', 'Sri Lanka', 'Afghanistan', 'Bhutan', 'Mauritius'];

function variant(name, r) {
  const rules = [
    [/u/, 'oo'], [/i/, 'ee'], [/sh/, 's'], [/v/, 'w'], [/a$/, 'aa'], [/th/, 't'],
  ];
  for (let k = 0; k < rules.length; k++) {
    const [re, rep] = rules[(k + r.int(0, 5)) % rules.length];
    if (re.test(name)) return name.replace(re, rep);
  }
  return name + 'h';
}

function makeApaar(r, used) {
  for (;;) {
    let base = String(r.int(1, 9));
    for (let i = 0; i < 10; i++) base += r.int(0, 9);
    const id = base + verhoeffDigit(base);
    if (!used.has(id)) {
      used.add(id);
      return id;
    }
  }
}

let REG = null;

export function buildRegistry() {
  if (REG) return REG;
  const r = prng(77);
  const used = new Set();
  const list = [];
  for (let i = 0; i < 2600; i++) {
    const g = r.chance(0.46) ? 'F' : 'M';
    const first = g === 'F' ? r.pick(FEMALE) : r.pick(MALE);
    const last = r.pick(LAST);
    const fn = r.chance(0.035);
    const ug = r.chance(0.7);
    const year = ug ? r.int(2005, 2008) : r.int(1999, 2003);
    const dob = `${year}-${String(r.int(1, 12)).padStart(2, '0')}-${String(r.int(1, 28)).padStart(2, '0')}`;
    list.push({
      apaarId: makeApaar(r, used),
      name: `${first} ${last}`,
      gender: g,
      dob,
      guardian: `${r.pick(MALE)} ${last}`,
      nationality: fn ? r.pick(FN_COUNTRIES) : 'Indian',
      ug,
    });
  }
  // Planted twins: same person, second APAAR ID, slightly different spelling.
  const twins = [];
  for (let i = 0; i < 6; i++) {
    const src = list[40 + i * 37];
    const [f, l] = src.name.split(' ');
    const t = { ...src, apaarId: makeApaar(r, used), name: `${variant(f, r)} ${l}`, twinOf: src.apaarId };
    twins.push(t);
  }
  list.push(...twins);
  const byId = new Map(list.map((x) => [x.apaarId, x]));
  REG = { list, byId, twins };
  return REG;
}

// Mirrors the ABC "verify APAAR" API contract.
export const mockAbc = {
  lookup(apaarId) {
    const rec = buildRegistry().byId.get(String(apaarId));
    return rec ? { found: true, apaarId: rec.apaarId, name: rec.name, dob: rec.dob, gender: rec.gender, nationality: rec.nationality } : { found: false };
  },
  verify({ apaarId, name, dob }) {
    const rec = buildRegistry().byId.get(String(apaarId));
    if (!rec) return { found: false, ok: false, nameScore: 0, dobMatch: false };
    const nameScore = Math.round(nameSimilarity(rec.name, name) * 100) / 100;
    const dobMatch = rec.dob === dob;
    return { found: true, ok: dobMatch, nameScore, dobMatch, registryName: rec.name };
  },
};
