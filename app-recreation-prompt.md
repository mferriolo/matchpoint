# Healthcare Recruitment Call Coach Application - Complete Recreation Prompt

Create a comprehensive React + TypeScript + Vite application for healthcare recruitment call coaching with the following specifications:

## Core Technologies & Dependencies
- React 18.3.1 with TypeScript
- Vite build tool
- Tailwind CSS with shadcn/ui components
- Supabase for backend services
- React Router for navigation
- React Query for data fetching
- Radix UI components (extensive collection)
- Lucide React icons
- React Hook Form with Zod validation
- Next Themes for theme management

## Application Architecture

### Main Structure
- **App.tsx**: Root component with providers (Theme, CallPrompt, QueryClient, Router)
- **Three main pages**: Index (main app), Admin panel, NotFound
- **Context-driven state management** with CallPromptContext and AppContext
- **Component-based architecture** with extensive UI component library

### Core Features

#### 1. Job Management System
- Create, edit, duplicate, and delete healthcare job postings
- Job types include: Physician, Advanced Practitioner (NP/PA), Physician Executive, Administrative Executive
- Each job contains:
  - Basic info (title, company, description)
  - Categorized questions (specific job questions, candidate needs, qualifications)
  - Selling points and objection handling
  - Call notes and summaries
  - Original job ad text

#### 2. Call Coaching Interface
- **Multiple call methods**: Zoom integration, phone calls, Twilio
- **Live call interface** with real-time prompts and guidance
- **Question management** with extensive predefined question libraries
- **Call recording and transcription** capabilities
- **Real-time coaching prompts** during calls

#### 3. Extensive Question Libraries
Create comprehensive question libraries for 60+ healthcare job types organized in categories:
- **Clinical Roles**: Physicians, Nurses, Therapists, Technicians
- **Administrative**: Medical Records, Patient Services, Transcriptionists  
- **Management & Leadership**: Practice Administrators, Clinic Managers, Hospital Administrators
- **Public Health**: Epidemiologists, Community Health Workers, Infection Control
- **Healthcare Technology**: Health Informatics, EMR Specialists, Clinical Systems Analysts
- **Corporate Leadership**: C-suite executives (CEO, CFO, CIO, CHRO, CMO)

#### 4. Admin Panel
Six-tab administration interface:
- **Settings**: System configuration
- **Users**: User management
- **Job Types**: Manage job type questions and categories
- **Call Types**: Configure call types (Initial Screening, Interview, Debriefing)
- **Reports**: Analytics and reporting
- **Audit**: System audit logs

#### 5. Call Notes & Analytics
- **Automated call note generation** using AI
- **Call summaries** with sentiment analysis
- **Question-response tracking**
- **Performance metrics** and scoring

## Technical Implementation Details

### State Management
- **CallPromptContext**: Manages jobs, current calls, call sessions
- **AppContext**: Application-wide state management
- **localStorage persistence** for job data
- **Supabase integration** for backend operations

### UI Components
Extensive shadcn/ui component library including:
- Forms, inputs, selects, textareas
- Cards, tabs, accordions, dialogs
- Tables, charts, progress indicators
- Navigation, sidebars, breadcrumbs
- Alerts, toasts, tooltips
- Advanced components: carousel, command palette, resizable panels

### Call Interface Features
- **Video call integration** with Zoom SDK
- **Phone call interface** with Twilio
- **Real-time transcript display**
- **Dynamic question prompting**
- **Checklist management** during calls
- **Sidebar video interface** for multi-tasking

### Data Models
Key TypeScript interfaces:
- **Job**: Complete job posting with questions and metadata
- **CallSession**: Active call tracking with transcript and prompts
- **CallNote**: Post-call documentation and summaries
- **QuestionResponse**: Question-answer pairs with timestamps

## Specific Healthcare Focus
- **Mission-driven language** emphasizing patient impact
- **Healthcare-specific terminology** and industry knowledge
- **Compliance and regulatory awareness**
- **Clinical workflow understanding**
- **Healthcare technology integration**

## File Structure Requirements
Organize into logical component hierarchy:
- `/components`: Main application components
- `/components/ui`: Reusable UI components
- `/components/admin`: Administration panel components
- `/contexts`: React context providers
- `/hooks`: Custom React hooks
- `/pages`: Main application pages
- `/types`: TypeScript type definitions
- `/utils`: Question libraries and utility functions
- `/lib`: Configuration and utility libraries

## Key Integrations
- **Supabase**: Database, authentication, edge functions
- **Zoom SDK**: Video conferencing integration
- **Twilio**: Phone call capabilities
- **ChatGPT API**: AI-powered content generation
- **Speech Recognition**: Voice-to-text capabilities

## Styling & Design
- **Tailwind CSS** for styling
- **Responsive design** with mobile considerations
- **Dark/light theme support**
- **Professional healthcare industry aesthetic**
- **Accessible UI components**

This application serves as a comprehensive tool for healthcare recruiters to conduct more effective candidate calls with AI-powered coaching, extensive question libraries, and integrated communication tools.