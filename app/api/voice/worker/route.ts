// C:\Projects\dayflow-ui\dayflow2-gui\app\api\voice\worker\route.ts
import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * GET /api/voice/worker
 * Check worker status
 */
export async function GET() {
  try {
    const { stdout } = await execAsync("pm2 jlist");
    const processes = JSON.parse(stdout);
    
    const worker = processes.find((p: any) => p.name === "voice-worker");
    
    if (!worker) {
      return NextResponse.json({
        status: "stopped",
        message: "Worker not found in PM2",
      });
    }
    
    return NextResponse.json({
      status: worker.pm2_env.status, // 'online', 'stopping', 'stopped', 'launching', 'errored'
      pid: worker.pid,
      uptime: worker.pm2_env.pm_uptime,
      restarts: worker.pm2_env.restart_time,
      memory: worker.monit.memory,
      cpu: worker.monit.cpu,
    });
  } catch (error: any) {
    console.error("[api/voice/worker] status check failed:", error);
    return NextResponse.json(
      {
        status: "error",
        message: error?.message || "Failed to check worker status",
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/voice/worker
 * Start or stop the worker
 * 
 * Body: { action: "start" | "stop" }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    
    if (!action || !["start", "stop"].includes(action)) {
      return NextResponse.json(
        { error: "Invalid action. Must be 'start' or 'stop'" },
        { status: 400 }
      );
    }
    
    if (action === "start") {
      try {
        // Check if already running
        const { stdout: listOutput } = await execAsync("pm2 jlist");
        const processes = JSON.parse(listOutput);
        const worker = processes.find((p: any) => p.name === "voice-worker");
        
        if (worker && worker.pm2_env.status === "online") {
          return NextResponse.json({
            success: true,
            message: "Worker already running",
            status: "online",
          });
        }
        
        // Start the worker
        const { stdout, stderr } = await execAsync(
          "pm2 start scripts/voice-worker.mjs --name voice-worker"
        );
        
        console.log("[api/voice/worker] start output:", stdout);
        if (stderr) console.error("[api/voice/worker] start stderr:", stderr);
        
        return NextResponse.json({
          success: true,
          message: "Worker started successfully",
          status: "online",
        });
      } catch (error: any) {
        // If already exists, try to restart
        if (error.message?.includes("already exists") || error.message?.includes("script already launched")) {
          try {
            const { stdout } = await execAsync("pm2 restart voice-worker");
            console.log("[api/voice/worker] restart output:", stdout);
            
            return NextResponse.json({
              success: true,
              message: "Worker restarted successfully",
              status: "online",
            });
          } catch (restartError: any) {
            console.error("[api/voice/worker] restart failed:", restartError);
            throw restartError;
          }
        }
        throw error;
      }
    } else if (action === "stop") {
      const { stdout, stderr } = await execAsync("pm2 stop voice-worker");
      
      console.log("[api/voice/worker] stop output:", stdout);
      if (stderr) console.error("[api/voice/worker] stop stderr:", stderr);
      
      return NextResponse.json({
        success: true,
        message: "Worker stopped successfully",
        status: "stopped",
      });
    }
  } catch (error: any) {
    console.error("[api/voice/worker] control action failed:", error);
    
    // Provide user-friendly error messages
    let userMessage = error?.message || "Worker control failed";
    let statusCode = 500;
    
    if (error.message?.includes("pm2: not found") || error.message?.includes("'pm2' is not recognized")) {
      userMessage = "PM2 is not installed. Please install it globally: npm install -g pm2";
      statusCode = 503;
    } else if (error.message?.includes("ENOENT")) {
      userMessage = "Worker script not found. Please check your installation.";
      statusCode = 404;
    }
    
    return NextResponse.json(
      {
        success: false,
        error: userMessage,
      },
      { status: statusCode }
    );
  }
}
