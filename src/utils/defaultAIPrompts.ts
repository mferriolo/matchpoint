// Default AI prompt templates
export const defaultAIPrompts = {
  job_advertisement: `Create a professional job advertisement using this exact structure with BOLD subheadings:

**About the Job**
A concise summary of the position's purpose and its importance within the organization.
Includes the job location, schedule (if available), and type (e.g., full-time, remote, hybrid).

**Who You Are**
A brief description of the ideal candidate, their background, values, or mindset.

**Who We Are**
A short, high-level overview of "Our Client," without naming the company.

**Your Role**
Describes the key duties and responsibilities in an engaging, easy-to-read format.

**How You Qualify**
Lists required and preferred qualifications, certifications, or experience.

**How You Are Supported**
Highlights benefits, bonuses, support structures, and incentives.

CRITICAL: NEVER use actual client names. ALWAYS refer to the company as "Our Client".`,

  text_message: `Redact the name of the Company, and replace it with "Our Client".

Step 1 – Find the single standout point
Read the job description once, scanning for the most unique, appealing reason someone would say "tell me more."

Step 2 – Compress it into one clear hook

Step 3 – Build your 1–2 sentence text
Sentence 1: Personal greeting + biggest hook.
Sentence 2: Role name + soft call-to-action.

Return format:
HOOK: [compressed hook]
TEXT MESSAGE: [1-2 sentence text]`,

  voicemail: `Create a conversational voicemail script that is engaging and encourages callback.

Extract the top hook from the job description - the most distinctive, positive point.
Script should be about 15 seconds when spoken (30-40 words).

Return format:
HOOK: [compressed hook]
SCRIPT: [conversational voicemail script]`,

  selling_points: `Identify the most compelling reasons a qualified candidate would want this job, ranked from most to least persuasive.

Look for: mission impact, career growth, unique benefits, prestige, support and resources.

Return as numbered list with brief, punchy statements.`,

  knockout_questions: `Review the job description and identify all required qualifications.

Create 3-5 knockout questions to confirm requirements early.

IMPORTANT: Make questions open-ended rather than yes/no.
- Instead of "Are you familiar with X?", ask "How familiar are you with X?"
- Instead of "Do you have experience with Y?", ask "What experience do you have with Y?"

List only the questions without additional text.`,

  objections: `Identify potential candidate objections to the job.

Look for triggers in: compensation, workload, location, company stability, role clarity, growth opportunities, work culture.

Rank objections by likelihood and impact.

Return as numbered list starting with most likely/highest impact objections.`,

  generate_presentation: `You are a professional recruiter writing a candidate presentation in paragraph format. Write the presentation using the candidate and job data provided in the user message (a JSON object). Output ONLY the four paragraphs below, replacing each [bracketed instruction] with concise prose drawn from the data. Do not include section headings, bullet points, the word "Paragraph", or any commentary.

Please consider {{CANDIDATE_NAME}} for the {{JOB_TITLE}} role at {{COMPANY}}. This candidate brings extensive experience in [summarize the candidate's relevant clinical, operational, or leadership background using WORK_HISTORY and CANDIDATE_BACKGROUND], including prior roles such as [list 2-4 key positions or organizations from WORK_HISTORY]. They have demonstrated success in [mention leadership achievements, team management, or notable outcomes inferred from WORK_HISTORY and INTERVIEW_NOTES], underscoring their capacity to contribute meaningfully to your organization.

Based in {{LOCATION}}, the candidate is [open to relocation, willing to travel, or committed to remaining local — infer from INTERVIEW_NOTES; if unclear, write "open to discussing the role's geographic requirements"], depending on the role's requirements. They are seeking a compensation package aligned with their experience and responsibilities, and are [open to negotiation if INTERVIEW_NOTES indicates flexibility; otherwise omit this clause]. Their earliest availability to begin a new role is [start date or notice period from INTERVIEW_NOTES; if unknown, write "to be confirmed"].

They hold [list degrees, certifications, and relevant state licenses from EDUCATION and SKILLS], ensuring compliance with your credentialing requirements.

{{CANDIDATE_NAME}} is genuinely enthusiastic about the opportunity at {{COMPANY}} and sees strong alignment between the role and their professional aspirations. They are especially drawn to [highlight cultural fit, mission alignment, or strategic opportunity inferred from JOB_REQUIREMENTS and CANDIDATE_BACKGROUND], and are eager to contribute their expertise to your team.

Rules:
- Replace every [bracketed instruction] with plain prose. Do NOT keep brackets or instruction text in the output.
- Do NOT fabricate credentials, achievements, prior employers, or details not supported by the data.
- If a section's source data is missing or uninformative, write a brief, neutral statement and move on.
- Use a professional, third-person narrative tone throughout.
- Output exactly four paragraphs in the order shown above. No extra text before or after.`,

  analyze_job: `Analyze the job order information and extract key details.

Identify and structure:
- Job title and department
- Key responsibilities and duties
- Required qualifications and skills
- Preferred qualifications
- Compensation and benefits
- Work schedule and location
- Company culture indicators

Provide a structured summary that can be used for candidate matching.`,

  parse_resume: `Parse the resume and extract structured candidate information.

Extract:
- Contact information (name, email, phone)
- Professional summary
- Work experience (company, title, dates, responsibilities)
- Education (degree, institution, graduation date)
- Skills (technical and soft skills)
- Certifications and licenses
- Notable achievements

Return in a structured format for database storage.`,

  gap_questions: `Based on the candidate's resume and the job requirements, identify gaps or areas needing clarification.

Generate thoughtful questions to:
- Clarify experience gaps
- Verify qualifications
- Understand career transitions
- Assess cultural fit
- Explore motivation for the role

Prioritize questions by importance to the hiring decision.`,

  call_coaching: `Provide real-time coaching suggestions during the call.

Analyze the conversation and suggest:
- Follow-up questions based on candidate responses
- Areas to probe deeper
- Red flags to address
- Positive indicators to explore
- Transition phrases to next topics

Keep suggestions concise and actionable.`,

  smart_job_update: `Analyze the call transcript and extract relevant job order updates.

Identify new information about:
- Updated requirements or qualifications
- Changes to compensation or benefits
- Timeline updates
- Additional responsibilities
- Client feedback or preferences

Format updates for easy review and database entry.`
};
