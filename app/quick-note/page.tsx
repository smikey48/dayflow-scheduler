'use client';

import { useState, useRef } from 'react';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import FeedbackButton from '../components/FeedbackButton';

export default function QuickNotePage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });

      chunksRef.current = [];
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(track => track.stop());
        await processRecording(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError('');
      setStatus('Recording... Tap Stop when done');
    } catch (err: any) {
      setError('Microphone access denied: ' + err.message);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setStatus('Processing...');
    }
  };

  const processRecording = async (audioBlob: Blob) => {
    setIsProcessing(true);
    try {
      const supabase = supabaseBrowser();
      
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Not authenticated');
      }

      // Generate unique filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `quick-note-${timestamp}.webm`;
      const storagePath = `${user.id}/${filename}`;

      // Upload to Supabase Storage
      setStatus('Uploading audio...');
      const { error: uploadError } = await supabase.storage
        .from('voice')
        .upload(storagePath, audioBlob, {
          contentType: 'audio/webm',
          upsert: false,
        });

      if (uploadError) {
        throw new Error('Upload failed: ' + uploadError.message);
      }

      // Create voice job
      setStatus('Creating transcription job...');
      const { data: jobData, error: jobError } = await supabase
        .from('voice_jobs')
        .insert({
          user_id: user.id,
          storage_path: storagePath,
          status: 'pending',
          uploaded_at: new Date().toISOString(),
          metadata: {
            source: 'quick-note',
            duration_override: 5,
            priority_override: 1,
          }
        })
        .select()
        .single();

      if (jobError) {
        throw new Error('Job creation failed: ' + jobError.message);
      }

      setStatus(`✅ Note recorded! Job ID: ${jobData.job_id}\n\nYour task will appear in Today's schedule within 1-2 minutes.`);
      setError('');
      
      // Auto-clear success message after 5 seconds
      setTimeout(() => {
        setStatus('');
      }, 5000);
      
    } catch (err: any) {
      setError('Error: ' + err.message);
      setStatus('');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white p-4 flex flex-col items-center justify-center">
      <FeedbackButton page="Quick Note" />
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold text-center mb-2 text-gray-800">
          Quick Voice Note
        </h1>
        <p className="text-center text-gray-600 mb-8">
          Record a quick task that will be scheduled as a 5-minute priority task
        </p>

        <div className="flex flex-col items-center space-y-6">
          {!isRecording && !isProcessing && (
            <button
              onClick={startRecording}
              className="w-32 h-32 rounded-full bg-red-500 hover:bg-red-600 active:bg-red-700 text-white flex items-center justify-center shadow-lg transition-all duration-200 transform hover:scale-105"
            >
              <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
              </svg>
            </button>
          )}

          {isRecording && (
            <button
              onClick={stopRecording}
              className="w-32 h-32 rounded-full bg-gray-700 hover:bg-gray-800 text-white flex items-center justify-center shadow-lg animate-pulse"
            >
              <div className="w-12 h-12 bg-white rounded-md"></div>
            </button>
          )}

          {isProcessing && (
            <div className="w-32 h-32 rounded-full bg-blue-500 text-white flex items-center justify-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-white"></div>
            </div>
          )}

          {status && (
            <div className="w-full p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-blue-800 whitespace-pre-line">{status}</p>
            </div>
          )}

          {error && (
            <div className="w-full p-4 bg-red-50 border border-red-200 rounded-lg text-center">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="text-center text-sm text-gray-500 space-y-2">
            <p>💡 Tips:</p>
            <ul className="text-left list-disc list-inside space-y-1">
              <li>Speak clearly and describe your task</li>
              <li>It will be scheduled as a 5-min task</li>
              <li>Priority is set to 1 (highest)</li>
              <li>Check "Today" page after 1-2 minutes</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
