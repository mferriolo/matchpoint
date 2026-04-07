// Job Order Questions - specific to job types for the job order section
import { JOB_ORDER_QUESTIONS_EXTENDED } from './jobOrderQuestionsExtended';
import { JOB_ORDER_QUESTIONS_CORE } from './jobOrderQuestionsCore';
import { JOB_ORDER_QUESTIONS_ADDITIONAL } from './jobOrderQuestionsAdditional';

export const JOB_ORDER_QUESTIONS: Record<string, string[]> = {
  "Advanced Practitioner (NP/PA)": [
    "For this role, will your NP/PA be functioning more autonomously or primarily in a support capacity to physicians?",
    "Are there specific procedures or patient populations you expect them to manage independently?",
    "How do you currently structure physician–APC collaboration (supervision ratios, shared rounding, co-signatures, etc.)?"
  ],
  "Nurse Practitioners and Physician Assistants": [
    "Which EMR systems are they expected to use daily, and are there any specialty templates already built for their workflow?",
    "What are the prescribing privileges and limitations you allow for NPs/PAs within your organization?",
    "Do you expect them to take part in quality initiatives such as reducing readmissions or improving HEDIS measures?"
  ],
  "Physician": [
    "How is call coverage structured—number of nights/weekends per month and expected response times?",
    "Beyond clinical care, do you expect this physician to participate in administrative duties such as protocol development or committee leadership?",
    "Which patient metrics or outcomes do you track most closely to evaluate physician performance?"
  ],
  "Physician (Specialists)": [
    "For this specialty, what is the typical patient volume per day or per clinic session you expect?",
    "Are there specific procedures or technologies (e.g., interventional radiology, robotics, endoscopy) that are a must-have skill set?",
    "What referral network or sources of patient volume will be available to them when they start?"
  ],
  "Physician Executive": [
    "What is the balance between their clinical duties and executive leadership responsibilities?",
    "Do you need this leader to drive value-based care initiatives (e.g., ACO participation, risk contracts), or is the focus on traditional fee-for-service management?",
    "How much direct responsibility will they have over provider recruitment, retention, and performance evaluation?"
  ],
  "Administrative Executive": [
    "What financial metrics (EBITDA, payer mix, cost-per-encounter) are most critical for this role to impact?",
    "Are they expected to lead payer contract negotiations directly or primarily oversee operational execution?",
    "What are your current biggest pain points in operational efficiency that you'd want this executive to address first?"
  ],
  "Licensed Clinical Social Workers (LCSWs)": [
    "Do you need LCSWs focused on therapy, discharge planning, or case management?",
    "Are they expected to bill under their own license, or will they work under physician supervision?",
    "What role will they play in crisis response (ED consults, suicide risk assessments, etc.)?"
  ],
  "Certified Nursing Assistants (CNAs)": [
    "What is the average patient load your CNAs handle per shift, and does that vary by unit?",
    "Do you expect CNAs to assist with restorative care programs (ambulation, range of motion exercises), or mainly ADLs?",
    "How do you train or orient CNAs to manage patients with dementia or other behavioral challenges?"
  ],
  "Chief Compliance Officer (CCO)": [
    "Which regulatory frameworks (HIPAA, Stark, Anti-Kickback, CMS audits) are top priority for this role?",
    "Do you need the CCO to build compliance training from scratch, or refine existing systems?",
    "How involved should they be in direct interactions with regulators during audits or investigations?"
  ],
  "Chief Executive Officer (CEO)": [
    "What immediate strategic goals (growth, culture change, market expansion) do you need the CEO to deliver in year one?",
    "Are you looking for a CEO with deep healthcare operations experience, or one with broader business turnaround expertise?",
    "What level of visibility do you expect them to have with the board, investors, and community stakeholders?"
  ],
  "Chief Financial Officer (CFO)": [
    "Which financial metrics (payer mix, risk contracts, operating margin) are most critical for the CFO to monitor?",
    "Do you need experience with capital raises, private equity, or health system joint ventures?",
    "How closely will they partner with clinical leadership to align financial and quality performance?"
  ],
  "Chief Human Resources Officer (CHRO)": [
    "What's your biggest HR pain point right now—recruitment, retention, benefits cost, or labor relations?",
    "Are you looking for a CHRO to implement innovative workforce models (gig nursing, hybrid teams), or strengthen traditional HR?",
    "How important is union negotiation or labor law expertise in this role?"
  ],
  "Chief Information Officer (CIO)": [
    "Are you prioritizing EMR optimization, digital health expansion, or infrastructure/cybersecurity upgrades?",
    "Do you need the CIO to lead data strategy (population health analytics, interoperability) or just oversee IT operations?",
    "How large and complex is the IT team or vendor ecosystem they'll be managing?"
  ],
  "Chief Marketing Officer (CMO – Marketing)": [
    "Are you focused more on patient acquisition, brand awareness, or physician referral growth?",
    "Which channels are most critical right now—digital, community outreach, or physician liaison programs?",
    "Do you expect your CMO to oversee patient experience initiatives in addition to traditional marketing?"
  ],
  "Chief Medical Officer (CMO)": [
    "Will the CMO maintain a clinical practice, or serve strictly in an administrative/leadership role?",
    "How involved will they be in value-based care strategy (ACO participation, risk-sharing agreements)?",
    "What level of responsibility will they carry for provider performance management and peer review?"
  ],
  "Chief Nursing Officer (CNO)": [
    "What is your current nurse staffing challenge—ratios, turnover, or pipeline?",
    "Are you looking for a CNO to champion Magnet status or other nursing excellence programs?",
    "How much authority does the CNO have over budgeting and staffing decisions versus operations leadership?"
  ],
  "Chief Operating Officer (COO)": [
    "What operational bottlenecks (throughput, scheduling, payer authorizations) are most urgent for the COO to fix?",
    "Should they be hands-on with clinical operations, or more focused on enterprise-level strategy?",
    "How closely will they need to partner with finance and compliance in daily decision-making?"
  ],
  "Audiologists": [
    "What diagnostic equipment (audiometers, tympanometers, cochlear implant programming) are they expected to operate?",
    "Do you want your audiologist to run vestibular/balance testing programs, or strictly hearing-related care?",
    "Are they expected to provide pediatric services, geriatric care, or both?"
  ],
  "Dietitians/Nutritionists": [
    "Are they expected to manage patient panels directly, or provide consults to physicians?",
    "Do you need them to specialize in specific areas such as renal, oncology, or diabetes nutrition?",
    "How much involvement do you want them to have in developing community wellness or education programs?"
  ],
  "Genetic Counselors": [
    "What percentage of their work will be direct patient counseling versus coordinating lab testing and reporting?",
    "Do you expect expertise in oncology, prenatal, or rare disease genetics specifically?",
    "How do you handle collaboration between your genetic counselors and your physicians or researchers?"
  ],
  "Medical Laboratory Technologists": [
    "Which laboratory specialties (hematology, microbiology, chemistry, molecular diagnostics) are most critical in your setting?",
    "Are they expected to troubleshoot and maintain lab instrumentation in addition to running assays?",
    "What turnaround times are your clinicians expecting for STAT or routine labs?"
  ],
  "Occupational Therapists (OTs)": [
    "Do you need OTs to specialize in inpatient rehab, outpatient neuro, or pediatric development?",
    "What caseload volume do you typically assign to an OT per week?",
    "Are they expected to design adaptive equipment solutions or mainly provide hands-on therapy?"
  ],
  "Care Coordinators": [
    "Do coordinators mainly handle scheduling, referral management, or patient follow-up?",
    "Are they assigned to specific providers or work across an entire clinic population?",
    "How much authority do they have to adjust care plans or escalate clinical concerns?"
  ],
  "Clinic Managers": [
    "Do you expect managers to carry budget responsibility, or focus mainly on staff and workflow?",
    "How large is the clinic team they will oversee (providers, nurses, admin staff)?",
    "What metrics do you use to measure clinic performance (RVUs, patient satisfaction, throughput)?"
  ],
  "Health Information Technicians": [
    "Which EMR or health information systems are most critical in your environment?",
    "Do you require knowledge of coding standards (ICD-10, CPT) or is this role purely records management?",
    "Are they expected to manage release-of-information requests and compliance audits?"
  ],
  "Hospital Administrators": [
    "Are you looking for a leader to focus on inpatient throughput, financial performance, or regulatory compliance?",
    "What's the scope of their oversight (single department vs. full hospital operations)?",
    "How closely will they work with medical staff leadership on quality and safety initiatives?"
  ],
  "Medical Coders and Billers": [
    "Which coding systems (ICD-10, CPT, HCPCS) are most relevant to your billing?",
    "Are they responsible for denial management and appeals, or just initial coding?",
    "What's your average claim volume per coder per day?"
  ],
  "Medical Receptionists": [
    "What scheduling systems or EMRs do they need to know?",
    "Do you expect receptionists to handle prior authorizations or strictly front-desk functions?",
    "How much patient triage (screening symptoms, routing calls) is expected?"
  ],
  "Medical Records Clerks": [
    "Is the role more about maintaining paper records, EMR scanning, or both?",
    "How often are they involved in responding to outside record requests (attorneys, insurers)?",
    "Do they support compliance audits or just file and retrieval?"
  ],
  "Medical Transcriptionists": [
    "Which transcription platforms or voice recognition tools do you use?",
    "Do you require familiarity with specific specialties (radiology, pathology, cardiology)?",
    "What's the expected turnaround time for completed reports?"
  ],
  "Patient Service Representatives": [
    "Do PSRs primarily handle check-in/out, insurance verification, or call center functions?",
    "How much financial responsibility do they carry (copay collection, payment plans)?",
    "Are they expected to upsell or promote ancillary services (screenings, wellness visits)?"
  ],
  "Practice Administrators": [
    "Are they managing one physician practice or a multi-site group?",
    "Do they carry responsibility for P&L, or is their focus on operations/staffing?",
    "What role do they play in payer contract negotiations?"
  ],
  "Program Directors": [
    "What type of program are they leading—clinical, community outreach, or research?",
    "Do they oversee grant compliance and reporting, or just program delivery?",
    "What's the size and makeup of the team they're expected to manage?"
  ],
  "Quality Improvement Managers": [
    "What quality frameworks do you use—Lean, Six Sigma, Joint Commission, CMS Core Measures?",
    "Are they responsible for staff training and education, or primarily for data analysis and reporting?",
    "Which clinical outcomes or patient experience metrics are your highest priorities?"
  ],
  "Community Health Workers": [
    "Are CHWs primarily focused on outreach and education, or do you expect them to provide case management and follow-up care?",
    "Which populations or neighborhoods are you prioritizing for this role?",
    "Do you require certification or lived-experience training for your CHWs?"
  ],
  "Epidemiologists": [
    "What types of surveillance data (infectious disease, chronic conditions, environmental exposures) will they be analyzing?",
    "Do you need expertise in outbreak investigation or long-term population health research?",
    "What software and analytic platforms (SAS, R, Tableau, ArcGIS) do you expect them to use?"
  ],
  "Health Educators": [
    "Are health educators developing curriculum, delivering group sessions, or working one-on-one with patients?",
    "Which health issues are highest priority in your community—nutrition, maternal health, chronic disease prevention?",
    "How much collaboration do you expect with schools, community organizations, or faith-based groups?"
  ],
  "Public Health Nurses": [
    "Will they spend more time on direct patient care or population health surveillance and data collection?",
    "Do you need expertise in specific areas like immunizations, maternal health, or communicable disease investigation?",
    "How much community outreach and education versus clinical work do you expect?"
  ],
  "Infection Control Specialists": [
    "What types of healthcare settings (acute care, long-term care, outpatient) will they be covering?",
    "Are they expected to lead outbreak investigations or focus more on prevention and surveillance?",
    "Do you need expertise with specific pathogens (C. diff, MRSA, COVID) or general infection control principles?"
  ],
  "Clinical Systems Analysts": [
    "Which EMR systems (Epic, Cerner, Allscripts) do they need to optimize and support?",
    "Are they focused more on workflow analysis and system configuration, or user training and support?",
    "Do you need them to handle integration projects between different clinical systems?"
  ],
  "Electronic Medical Records (EMR) Specialists": [
    "What EMR platform are they expected to support, and what's the scope of customization needed?",
    "Are they responsible for user training, system maintenance, or both?",
    "How involved will they be in EMR upgrades, migrations, or new module implementations?"
  ],
  "Health Informatics Specialists": [
    "Are they focused more on clinical decision support, population health analytics, or interoperability projects?",
    "What data visualization and analytics tools (Tableau, Power BI, SQL) do you expect them to use?",
    "Do you need expertise in specific standards like HL7, FHIR, or quality reporting measures?"
  ],
  "Medical Device Technicians": [
    "What types of medical equipment (imaging, lab, surgical, patient monitoring) will they primarily service?",
    "Are they expected to handle preventive maintenance, repairs, or both?",
    "Do you need certification on specific manufacturer equipment (GE, Philips, Siemens)?"
  ],
  "Telehealth Coordinators": [
    "What telehealth platforms and technologies will they be managing?",
    "Are they focused more on patient scheduling and support, or provider training and technical troubleshooting?",
    "Do you need them to help develop new telehealth programs or optimize existing ones?"
  ],
  // Merge in the extended, core, and additional questions
  ...JOB_ORDER_QUESTIONS_CORE,
  ...JOB_ORDER_QUESTIONS_ADDITIONAL,
  ...JOB_ORDER_QUESTIONS_EXTENDED
};