// data.js — clean starter category structure. State is seeded once then stored in localStorage.

const DEFAULT_CATEGORIES = {
  "Anorexia & Atypical Anorexia": ["Restriction", "Weight Restoration", "Medical Considerations"],
  "Bulimia": ["Purging", "Medical Considerations"],
  "Binge Eating Disorder": ["Restriction-Binge Cycle", "Binge Triggers"],
  "ARFID": ["Sensory Sensitivity", "Low Interest in Eating", "Fear of Aversive Consequences", "Food Chaining", "Preferred Foods", "Exposures"],
  "Orthorexia": ["Food Rules", "Clean Eating"],
  "Populations": ["Adolescents", "Males", "Mid-Life"],
  "Co-Occurring Disorders": ["OCD", "ADHD", "Autism Spectrum Disorder", "GI Disorders", "BPD", "Anxiety", "Depression"],
  "Restriction": ["intermittent fasting", "fear/safe foods", "inadequate calorie intake"],
  "Purging": ["Self-induced vomiting", "laxatives"],
  "Binge Eating": ["Subjective binges", "objective binges"],
  "Compulsive Exercise": ["RED-S", "Safe Exercise at Every Stage (SEES)"],
  "Excessive Self-Monitoring": ["Fitness Trackers", "Counting Calories"],
  "Misc Disordered Behaviors": ["Avoidance of grocery shopping"],
  "Medications / Supplements / Substances": ["GLP-1s", "Laxatives", "Cannabis", "ADHD Medications", "Supplements", "Caffeine", "alcohol"],
  "Treatment Targets": ["Early Engagement", "Regular Eating", "Adequacy", "Behavior Reduction", "Flexibility", "Medical Stability", "Relapse Prevention"],
  "Meal Planning Methods": ["Plate by Plate Approach", "Exchanges"],
  "Meal Planning Tools": ["Snack lists", "Grocery Planning", "Low-Effort Meals"],
  "Nutrition Education": ["Food groups", "fiber"],
  "Biological/Physiological": ["Metabolism", "Hormones"],
  "Nutrition Rehabilitation": ["Weight Restoration", "Refeeding Risk", "Early Satiety", "GI Symptoms", "Hunger/Fullness Cues", "Hypermetabolism", "supplementation"],
  "Interventions": ["Food Exposures", "Behavioral Experiments", "Values Work", "Meal Support"],
  "Monitoring": ["Recovery Record"],
  "Challenges": ["Sensory Sensitivity", "Low Appetite", "Nausea", "Early Satiety", "Executive Dysfunction", "Low Motivation"],
  "Movement / Exercise": ["Return to Movement", "Rest Days", "Fitness Trackers"],
  "Body Image": ["Body Checking", "Body Avoidance", "Body Neutrality", "Scales/Self weighing", "shopping"],
  "Family / Support": ["Meal Support for Adults", "Education for Partners"],
  "FBT": ["Meal Support", "Phases"],
  "Assessment": ["Initial Assessment", "Screening Tools", "Medical Risk", "HLOC", "Stages of Change"],
  "Resources / References": ["Guidelines", "Articles", "Books", "Trainings", "Websites", "Podcasts", "Handouts"],
  "Projects / Ideas": ["Future Handouts", "Drafts"]
};

const ALL_DIAG = ["BED","AN","BN","ARFID","OSFED","Atypical AN","ED + neurodivergence","ED + GI concerns","ED + sports/dance"];

// No sample entries are preloaded. The index should start empty except for categories/subcategories.
const STARTER_ENTRIES = [];
const STARTER_TASKS = [];
