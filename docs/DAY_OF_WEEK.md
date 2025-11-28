# Day of Week Conventions

## 🚨 CRITICAL: Standard Day Numbering

**Our system uses Monday = 0, Sunday = 6**

```
Monday    = 0
Tuesday   = 1
Wednesday = 2
Thursday  = 3
Friday    = 4
Saturday  = 5
Sunday    = 6
```

## Why This Matters

JavaScript's `Date.getDay()` returns **different** values:
- Sunday = 0
- Monday = 1
- Tuesday = 2
- etc.

**ALWAYS convert** when working with JavaScript dates!

## Usage

### ✅ Correct: Using Utility Functions

```typescript
import { jsDayToStandard, standardToJsDay, getCurrentDayOfWeek } from '@/lib/dayOfWeek';

// Getting today's day
const today = new Date();
const jsDay = today.getDay(); // JavaScript's Sunday=0 format
const ourDay = jsDayToStandard(jsDay); // Converts to our Monday=0 format

// OR use the helper directly
const dayOfWeek = getCurrentDayOfWeek(); // Returns Mon=0, Tue=1, etc.
```

### ❌ Wrong: Direct Use of getDay()

```typescript
// DON'T DO THIS - it uses Sunday=0 format
const today = new Date();
const dayOfWeek = today.getDay(); // WRONG FORMAT!
if (template.repeat_days.includes(dayOfWeek)) { // BUG: format mismatch!
  // ...
}
```

### ✅ Correct: Database Operations

```typescript
// Database stores days as Mon=0, Tue=1, ..., Sun=6
const template = {
  repeat_unit: 'weekly',
  repeat_days: [1, 3], // Tuesday and Thursday
};
```

### ✅ Correct: SQL Updates

```sql
-- Set to Tuesday (our format: Tue=1)
UPDATE task_templates 
SET repeat_days = ARRAY[1]
WHERE id = '...';

-- Or with curly brace syntax
UPDATE task_templates 
SET repeat_days = '{1}'::integer[]
WHERE id = '...';
```

## Files Using This Standard

### Core Utilities
- ✅ `lib/dayOfWeek.ts` - Conversion functions and constants

### Frontend
- ✅ `app/today/page.tsx` - Converts JavaScript days when checking recurring tasks
- ✅ `app/components/voice/Recorder.tsx` - Uses standard for day calculations

### Backend
- ✅ `app/api/voice-task/route.ts` - Stores repeat_days in database
- ✅ `prompts/d2_voice_task_system.md` - AI prompt specifying Mon=0, Tue=1, etc.

### Database
- ✅ `task_templates.repeat_days` - PostgreSQL integer array (Mon=0, Tue=1, ..., Sun=6)
- ✅ `scheduled_tasks` - Inherits day format from templates

## Common Pitfalls

### 1. Forgetting to Convert JavaScript Dates

```typescript
// ❌ WRONG
const today = new Date();
const dayOfWeek = today.getDay(); // Sunday=0 format
if (template.repeat_days.includes(dayOfWeek)) { /* BUG */ }

// ✅ CORRECT
import { jsDayToStandard } from '@/lib/dayOfWeek';
const today = new Date();
const jsDay = today.getDay();
const dayOfWeek = jsDayToStandard(jsDay); // Converts to Mon=0 format
if (template.repeat_days.includes(dayOfWeek)) { /* Works! */ }
```

### 2. Hardcoding Day Numbers

```typescript
// ❌ WRONG - unclear which format
if (dayOfWeek === 2) { // Is this Tuesday? Depends on format!
  // ...
}

// ✅ CORRECT - explicit and documented
import { parseDayName } from '@/lib/dayOfWeek';
const tuesdayIndex = parseDayName('Tuesday'); // Returns 1
if (dayOfWeek === tuesdayIndex) {
  // ...
}
```

### 3. Weekday Range Checks

```typescript
// ❌ WRONG - assumes JavaScript format (Mon-Fri = 1-5)
const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

// ✅ CORRECT - uses our format (Mon-Fri = 0-4)
const isWeekday = dayOfWeek >= 0 && dayOfWeek <= 4;
```

## Testing

When writing tests, always use explicit day names or the utility functions:

```typescript
import { parseDayName } from '@/lib/dayOfWeek';

describe('recurring tasks', () => {
  it('should include Tuesday tasks on Tuesday', () => {
    const template = {
      repeat_unit: 'weekly',
      repeat_days: [parseDayName('Tuesday')], // Returns [1]
    };
    
    const today = parseDayName('Tuesday'); // Returns 1
    expect(template.repeat_days.includes(today)).toBe(true);
  });
});
```

## Migration Notes

If you find code using the wrong format:

1. Import the utility functions from `lib/dayOfWeek.ts`
2. Use `jsDayToStandard()` to convert JavaScript's `getDay()` results
3. Document your changes in PR comments
4. Add tests to prevent regression

## Questions?

If you're unsure which format to use:
- **Database, API responses, internal logic**: Use Mon=0, Sun=6
- **JavaScript Date objects**: Use `jsDayToStandard()` to convert
- **User display**: Use `getDayName()` or `getDayNameShort()` from utilities
