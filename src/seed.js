const { openDb, STAGES } = require('./db');

const first = ['Aarav','Priya','Rohan','Ananya','Vikram','Sneha','Arjun','Neha','Karan','Isha','Rahul','Meera','Siddharth','Pooja','Aditya','Kavya','Nikhil','Riya','Manish','Divya','Sam','Taylor','Jordan','Alex'];
const last = ['Sharma','Patel','Mehta','Iyer','Singh','Gupta','Reddy','Nair','Joshi','Kapoor','Verma','Rao','Khan','Das','Bose','Smith','Lee','Brown'];
const positions = ['Frontend Engineer','Backend Engineer','Full Stack Developer','Data Analyst','Product Designer','QA Engineer','DevOps Engineer'];
const skillSets = {
  'Frontend Engineer': ['React','TypeScript','CSS','HTML','Next.js'],
  'Backend Engineer': ['Node.js','Python','PostgreSQL','Docker','Redis'],
  'Full Stack Developer': ['React','Node.js','MongoDB','SQL','AWS'],
  'Data Analyst': ['SQL','Python','Tableau','Excel','Statistics'],
  'Product Designer': ['Figma','UX Research','Prototyping','Design Systems'],
  'QA Engineer': ['Selenium','Cypress','Jest','API Testing'],
  'DevOps Engineer': ['AWS','Kubernetes','Terraform','CI/CD','Docker'],
};
const sources = ['LinkedIn','Referral','Job Board','Career Site','Agency','Direct'];

function rnd(a) { return a[Math.floor(Math.random() * a.length)]; }
function seed(db, n = 28) {
  const count = db.prepare('SELECT COUNT(*) c FROM candidates').get().c;
  if (count > 0) return 0;
  const ins = db.prepare(`INSERT INTO candidates (name,email,phone,position,skills,experience_years,source,stage,rating,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const hist = db.prepare('INSERT INTO stage_history (candidate_id,from_stage,to_stage,changed_at) VALUES (?,?,?,?)');
  const note = db.prepare('INSERT INTO notes (candidate_id,body,created_at) VALUES (?,?,?)');
  const fmt = (d) => d.toISOString().slice(0, 19).replace('T', ' ');
  db.transaction(() => {
    for (let i = 0; i < n; i++) {
      const name = `${rnd(first)} ${rnd(last)}`;
      const pos = rnd(positions);
      const skills = [...skillSets[pos]].sort(() => Math.random() - 0.5).slice(0, 3).join(', ');
      const stage = STAGES[Math.min(STAGES.length - 1, Math.floor(Math.random() ** 1.4 * STAGES.length))];
      const created = new Date(Date.now() - Math.floor(Math.random() * 40) * 86400000);
      const path = stage === 'Rejected'
        ? STAGES.slice(0, 1 + Math.floor(Math.random() * 3)).concat('Rejected')
        : STAGES.slice(0, STAGES.indexOf(stage) + 1);
      try {
        const id = ins.run(name, `${name.toLowerCase().replace(/\s+/g, '.')}${i}@example.com`,
          `+91 9${String(Math.floor(Math.random() * 1e9)).padStart(9, '0')}`, pos, skills,
          Math.floor(Math.random() * 10), rnd(sources), stage, Math.floor(Math.random() * 6),
          fmt(created), fmt(created)).lastInsertRowid;
        let t = created.getTime();
        path.forEach((s, k) => {
          t += k === 0 ? 0 : Math.floor(Math.random() * 5 + 1) * 86400000;
          hist.run(id, k ? path[k - 1] : null, s, fmt(new Date(Math.min(t, Date.now()))));
        });
        if (Math.random() > 0.5) note.run(id, 'Strong communication skills; follow up on salary expectations.', fmt(created));
      } catch (_) { /* duplicate email, skip */ }
    }
  })();
  return n;
}

module.exports = { seed };
if (require.main === module) {
  const db = openDb();
  console.log(`Seeded ${seed(db)} candidates`);
}
