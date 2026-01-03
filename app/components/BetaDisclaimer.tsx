'use client';

import { useState } from 'react';

interface BetaDisclaimerProps {
  onAccept: () => void;
  onDecline: () => void;
}

export default function BetaDisclaimer({ onAccept, onDecline }: BetaDisclaimerProps) {
  const [hasRead, setHasRead] = useState(false);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-3xl w-full bg-white rounded-2xl shadow-xl p-8">
        <div className="text-center mb-6">
          <div className="inline-block p-3 bg-amber-100 rounded-full mb-4">
            <svg className="w-8 h-8 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Beta Testing Agreement</h1>
          <p className="text-gray-600">Please read carefully before continuing</p>
        </div>

        <div className="bg-gray-50 rounded-lg p-6 mb-6 max-h-96 overflow-y-auto border border-gray-200">
          <div className="space-y-4 text-sm text-gray-700">
            <p className="font-semibold text-gray-900 text-base">
              Welcome to the DayFlow Beta Programme
            </p>

            <p>
              By using this software, you acknowledge and agree to the following terms:
            </p>

            <div className="space-y-3">
              <div>
                <h3 className="font-semibold text-gray-900 mb-1">⚠️ Beta Software Notice</h3>
                <p>
                  This software is provided for <strong>testing purposes only</strong> and is in active development. 
                  It may contain errors, bugs, or incomplete features that could affect functionality or cause data loss.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">🔒 No Warranty</h3>
                <p>
                  The software is provided <strong>"as is"</strong>, without warranty of any kind, express or implied. 
                  We make no guarantees about its performance, reliability, availability, or suitability for any purpose.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">⚖️ Limitation of Liability</h3>
                <p>
                  You use this software entirely <strong>at your own risk</strong>. We are not liable for any damages, 
                  losses, or issues arising from your use, including but not limited to data loss, schedule disruptions, 
                  missed appointments, or any other consequential damages.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">💾 Data & Privacy</h3>
                <p>
                  Your data will be stored and processed for the purpose of providing this service. We take reasonable 
                  measures to protect your information, but cannot guarantee absolute security. By using this software, 
                  you consent to the collection and processing of your data in accordance with UK GDPR requirements.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">🚫 Not for Production Use</h3>
                <p>
                  <strong>Do not use this software with critical, sensitive, or production data.</strong> Do not rely 
                  on it for important deadlines, appointments, or tasks where failure could cause significant harm or loss.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">🛠️ Support & Availability</h3>
                <p>
                  We provide <strong>no guarantee of support, maintenance, or continued availability</strong>. The service 
                  may be modified, suspended, or discontinued at any time without notice.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">📊 Feedback & Usage Data</h3>
                <p>
                  We may collect usage data and analytics to improve the software. By participating in the beta programme, 
                  you agree to provide feedback and help identify issues.
                </p>
              </div>

              <div>
                <h3 className="font-semibold text-gray-900 mb-1">🇬🇧 UK Consumer Rights</h3>
                <p>
                  Nothing in this agreement affects your statutory rights under UK law, including the Consumer Rights Act 2015, 
                  where applicable.
                </p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="font-semibold text-amber-900 mb-2">
                Important Reminder:
              </p>
              <p className="text-amber-800">
                This is experimental software. Please back up any important data elsewhere and do not rely on it 
                as your sole method of task management or scheduling.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <label className="flex items-start space-x-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hasRead}
              onChange={(e) => setHasRead(e.target.checked)}
              className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              I have read and understand the terms above. I acknowledge that this is beta software and accept 
              the associated risks, including potential data loss and unreliability.
            </span>
          </label>

          <div className="flex gap-3">
            <button
              onClick={onDecline}
              className="flex-1 px-6 py-3 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              disabled={!hasRead}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Accept & Continue
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 text-center mt-6">
          By clicking "Accept & Continue", you agree to these terms and can proceed with using DayFlow.
        </p>
      </div>
    </div>
  );
}
