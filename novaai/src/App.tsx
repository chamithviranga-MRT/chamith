import Navbar from './components/Navbar';
import ScrollVideo from './components/ScrollVideo';
import SectionOne from './components/SectionOne';
import SectionTwo from './components/SectionTwo';

export default function App() {
  return (
    <div className="relative">
      <ScrollVideo />

      <div className="relative z-10">
        <Navbar />
        <main>
          <SectionOne />
          {/* Scroll runway: gives the video timeline room to scrub between sections. */}
          <div className="h-[80vh]" aria-hidden="true" />
          <SectionTwo />
        </main>
      </div>
    </div>
  );
}
