# Knockout Questions Auto-Check Feature

## Problem
Knockout questions only had manual toggle functionality. Users had to manually click each question to mark it as asked. The AI Prompts & Questions section had auto-detection that would automatically check off questions when the system detected them being asked via speech recognition, but this functionality was missing for Knockout Questions.

## Solution
Enhanced the `checkTranscriptMatches()` function in `LiveCall.tsx` to also auto-detect knockout questions using the same speech recognition logic as AI Prompts & Questions.

## How It Works

### Auto-Detection Logic
1. **Speech Recognition**: The system continuously listens to the call via speech recognition
2. **Transcript Analysis**: When speech is detected and finalized, the transcript is analyzed
3. **Keyword Matching**: For each question (both AI Prompts and Knockout Questions):
   - Extract words longer than 3 characters
   - Compare against the spoken transcript
   - Calculate match percentage
4. **Auto-Check**: If 40% or more words match, the question is automatically marked as asked

### Implementation Details

**File Modified**: `src/components/LiveCall.tsx`

**Lines Changed**: 189-248

**Key Changes**:
```typescript
// Added knockout questions auto-detection to checkTranscriptMatches()
if (knockoutQuestions.length > 0) {
  knockoutQuestions.forEach((question, index) => {
    // Skip if already asked
    if (askedKnockoutQuestions.includes(index)) return;
    
    const normalizedQuestion = question.toLowerCase().trim();
    
    // Check for close matches (contains key words)
    const questionWords = normalizedQuestion.split(' ').filter(word => word.length > 3);
    const matchCount = questionWords.filter(word => normalizedText.includes(word)).length;
    const matchPercentage = matchCount / Math.max(questionWords.length, 1);
    
    // Mark as asked if 40% or more words match
    if (matchPercentage >= 0.4) {
      console.log('Auto-detected knockout question:', question);
      
      // Mark as asked
      setAskedKnockoutQuestions(prev => [...prev, index]);
      
      // Add to transcript
      handleQuestionAsked(question);
    }
  });
}
```

## Features

### Knockout Questions Now Have:
1. ✅ **Auto-Detection**: Automatically checked when system detects them being asked
2. ✅ **Manual Toggle**: Still can be manually clicked to mark as asked/unasked
3. ✅ **Transcript Integration**: Auto-detected questions are added to the call transcript
4. ✅ **Visual Feedback**: Green highlight when marked as asked
5. ✅ **Consistent UX**: Same behavior as AI Prompts & Questions section

## User Experience

### Before
- User had to manually click each knockout question after asking it
- No automatic detection
- Easy to forget to mark questions as asked

### After
- System automatically detects and checks off questions as they're asked
- User can still manually toggle if needed
- Consistent experience across all question types
- Questions appear in the call transcript automatically

## Testing
To verify the feature works:
1. Create a job with knockout questions
2. Start an Initial Screening or Full Interview call
3. Ask one of the knockout questions during the call
4. Observe:
   - Question automatically gets checked off (green highlight)
   - Question appears in the Call Transcript section
   - Can still manually toggle the checkbox if needed

## Related Files
- `src/components/LiveCall.tsx` - Main implementation
- `src/components/JobDetailsTabs.tsx` - Knockout questions management
- `src/contexts/CallPromptContext.tsx` - Call session management
