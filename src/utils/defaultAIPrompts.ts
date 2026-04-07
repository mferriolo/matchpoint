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

  generate_presentation: `You are a professional recruiter creating a candidate presentation.

Create a compelling 2-3 paragraph presentation that:
1. Opens with a professional introduction of the candidate highlighting their current role and key credentials
2. Explains their relevant experience and qualifications that directly match the job requirements
3. Articulates why they are an excellent fit for the specific role, emphasizing their unique value proposition
4. Includes specific examples from their background that demonstrate their capabilities
5. Addresses key requirements from the job description
6. Concludes with a clear, confident recommendation

Format: Professional narrative style, easy to read, compelling and persuasive. Focus on selling the candidate's strengths while maintaining authenticity.`,

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
