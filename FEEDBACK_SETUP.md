# Feedback System Setup

The feedback button has been added to DayFlow. It's currently on the landing/introduction page as a test.

## How It Works

1. A floating "Feedback" button appears in the bottom-right corner
2. Clicking it opens a modal with a text area for detailed feedback
3. User can write their suggestions/issues
4. On submit, the feedback is sent to: **mike_j_lewis@hotmail.co.uk**

## Email Service Configuration

The system supports two modes:

### Production Mode (Resend API)
To send real emails, add this to your `.env.local`:

```
RESEND_API_KEY=your_resend_api_key_here
```

Sign up at https://resend.com (free tier: 100 emails/day)

### Development Mode (Console Logging)
If no `RESEND_API_KEY` is set, feedback is logged to the console instead. This is perfect for testing.

## Testing

1. Start the dev server: `npm run dev`
2. Navigate to http://localhost:3000/intro
3. Click the "Feedback" button in the bottom-right
4. Type some feedback and click "Send Feedback"
5. Check the terminal/console for the logged feedback

## Adding to Other Pages

To add the feedback button to any page, simply import and add:

```tsx
import FeedbackButton from '@/app/components/FeedbackButton';

// In your component JSX:
<FeedbackButton page="Page Name" />
```

The `page` prop helps identify where the feedback came from.

## Files Created

- `app/api/feedback/route.ts` - API endpoint for handling feedback
- `app/components/FeedbackButton.tsx` - Reusable feedback button component
- `app/intro/page.tsx` - Updated to include feedback button (test implementation)
