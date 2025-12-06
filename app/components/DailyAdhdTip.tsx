'use client';

import { useState, useEffect } from 'react';

const ADHD_TIPS = [
  {
    title: "Understanding Dopamine",
    content: "Dopamine is not motivation juice. It is a prediction signal - it rewards \"this will work, this is interesting, this is meaningful\".",
    source: "Neuroscience of ADHD"
  },
  {
    title: "Task Initiation",
    content: "ADHD isn't about knowing what to do - it's about doing what you know. The gap between intention and action is the core challenge.",
    source: "Executive Function Research"
  },
  {
    title: "Time Blindness",
    content: "People with ADHD often experience 'time blindness' - difficulty perceiving the passage of time. This is why timers and external reminders are crucial.",
    source: "ADHD Time Management"
  },
  {
    title: "Interest-Based Nervous System",
    content: "ADHD brains are motivated by interest, challenge, novelty, and urgency - not by importance or consequences.",
    source: "Dr. William Dodson"
  },
  {
    title: "Working Memory",
    content: "ADHD significantly impacts working memory - your brain's 'mental sticky note'. Writing things down isn't a crutch, it's a necessity.",
    source: "Cognitive Psychology"
  },
  {
    title: "Hyperfocus",
    content: "Hyperfocus is both a superpower and a trap. It's not conscious focus - it's getting locked into something interesting and losing track of everything else.",
    source: "ADHD Attention Patterns"
  },
  {
    title: "Emotional Regulation",
    content: "ADHD often includes emotional dysregulation - feelings hit harder and faster. This isn't being 'too sensitive', it's a neurological difference.",
    source: "Emotional Processing Research"
  },
  {
    title: "Decision Fatigue",
    content: "Every decision depletes your executive function. Routines and systems reduce decisions, preserving mental energy for what matters.",
    source: "Executive Function Studies"
  },
  {
    title: "Body Doubling",
    content: "Working alongside someone else (even virtually) can dramatically improve task completion. The presence of another person activates different neural pathways.",
    source: "ADHD Productivity Strategies"
  },
  {
    title: "Medication Misconception",
    content: "ADHD medication doesn't make you focus on boring things - it helps you choose what to focus on instead of being at the mercy of what's most stimulating.",
    source: "ADHD Treatment"
  },
  {
    title: "Object Permanence",
    content: "Out of sight often means out of mind with ADHD. Visual reminders, open storage, and keeping important items in view helps combat this.",
    source: "ADHD Organization"
  },
  {
    title: "Rejection Sensitivity",
    content: "Rejection Sensitive Dysphoria (RSD) is intense emotional pain from perceived rejection or criticism. It's a real neurological response, not overreacting.",
    source: "Dr. William Dodson"
  },
  {
    title: "Energy Management",
    content: "With ADHD, you don't manage time - you manage energy. Schedule demanding tasks when your energy and medication are at their peak.",
    source: "ADHD Life Management"
  },
  {
    title: "Transition Difficulty",
    content: "Switching between tasks is cognitively expensive with ADHD. Build in buffer time between activities and use transition rituals.",
    source: "Executive Function Research"
  },
  {
    title: "Paralysis vs Laziness",
    content: "Task paralysis isn't laziness - it's executive dysfunction. Your brain can't initiate the task even though you desperately want to do it.",
    source: "ADHD Misconceptions"
  }
];

export default function DailyAdhdTip() {
  const [tip, setTip] = useState(ADHD_TIPS[0]);
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    // Pick a tip based on the day of year (so it changes daily but is consistent)
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    const tipIndex = dayOfYear % ADHD_TIPS.length;
    setTip(ADHD_TIPS[tipIndex]);
  }, []);

  return (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg shadow-sm overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-blue-100 transition-colors"
        onClick={() => setIsCollapsed(!isCollapsed)}
      >
        <div className="flex items-center gap-3">
          <span className="text-2xl">🧠</span>
          <h3 className="font-semibold text-gray-800">Daily ADHD Insight</h3>
        </div>
        <button 
          className="text-gray-600 hover:text-gray-800 text-xl"
          aria-label={isCollapsed ? "Expand" : "Collapse"}
        >
          {isCollapsed ? '▼' : '▲'}
        </button>
      </div>
      
      {!isCollapsed && (
        <div className="px-4 pb-4 space-y-3">
          <div className="flex items-start gap-2">
            <span className="text-blue-600 text-lg mt-1">💡</span>
            <div className="flex-1">
              <h4 className="font-medium text-gray-900 mb-2">{tip.title}</h4>
              <p className="text-gray-700 leading-relaxed">{tip.content}</p>
            </div>
          </div>
          <div className="flex justify-between items-center pt-2 border-t border-blue-200">
            <span className="text-xs text-gray-500 italic">{tip.source}</span>
            <span className="text-xs text-gray-400">Tip {ADHD_TIPS.indexOf(tip) + 1} of {ADHD_TIPS.length}</span>
          </div>
        </div>
      )}
    </div>
  );
}
