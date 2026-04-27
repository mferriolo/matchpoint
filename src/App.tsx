
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/theme-provider";
import { CallPromptProvider } from "@/contexts/CallPromptContext";
import ErrorBoundary from "@/components/ErrorBoundary";
import Index from "./pages/Index";
import Admin from "./pages/Admin";
import ResumeParser from "./pages/ResumeParser";
import CallSummaryPage from "./pages/CallSummaryPage";
import LiveCalls from "./pages/LiveCalls";
import PresentationsWithSidebar from "./components/PresentationsWithSidebar";
import NotFound from "./pages/NotFound";
import JoinCall from "./pages/JoinCall";
import MarketingNewJobs from "./pages/MarketingNewJobs";
import MobileRoute from "@/components/mobile/MobileRoute";



const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
  <ThemeProvider defaultTheme="light">
    <CallPromptProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/admin" element={<Admin />} />
              <Route path="/resume-parser" element={<MobileRoute title="Resume Parser"><ResumeParser /></MobileRoute>} />
              <Route path="/live-calls" element={<MobileRoute title="Live Calls"><LiveCalls /></MobileRoute>} />
              <Route path="/call-summary/:callId" element={<MobileRoute title="Call Summary"><CallSummaryPage /></MobileRoute>} />
              {/* PresentationsWithSidebar branches internally on mobile and
                  brings its own MobileShell, so no MobileRoute wrap here. */}
              <Route path="/presentations" element={<PresentationsWithSidebar />} />
              <Route path="/join-call" element={<MobileRoute title="Join Call" hideBottomNav><JoinCall /></MobileRoute>} />
              <Route path="/marketing" element={<MarketingNewJobs />} />
              <Route path="*" element={<NotFound />} />
            </Routes>

          </BrowserRouter>


        </TooltipProvider>
      </QueryClientProvider>
    </CallPromptProvider>
  </ThemeProvider>
  </ErrorBoundary>
);


export default App;

