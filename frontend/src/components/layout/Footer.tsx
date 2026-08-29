import { Link } from "react-router-dom"

export function Footer() {
  return (
    <footer className="w-full bg-black text-white py-16 px-4 md:px-8 border-t-4 border-foreground">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="md:col-span-1 flex flex-col gap-3">
          <h2 className="text-3xl font-display font-black tracking-tight text-white uppercase">RE-LOVED DIGITAL</h2>
          <span className="text-xs font-black uppercase tracking-widest text-accent-pink bg-white/10 px-2 py-1 inline-block border border-white/20 w-fit">
            THE DIGITAL WALL OF KINDNESS
          </span>
          <p className="text-white/80 text-sm font-medium italic mt-2 border-l-2 border-accent-green pl-3">
            “Because preloved only costs kindness.”
          </p>
          <p className="text-white/60 text-xs mt-1">
            Pre-Loved Goods for Free &bull; Coordinated through verified community partners.
          </p>
        </div>
        
        <div className="flex flex-col gap-3">
          <h3 className="font-black text-xs tracking-widest uppercase text-accent-green mb-2">Explore Wall</h3>
          <Link to="/drop" className="text-sm font-bold hover:text-accent-pink transition-colors">Wall of Kindness</Link>
          <Link to="/give" className="text-sm font-bold hover:text-accent-pink transition-colors">Drop an Item</Link>
          <Link to="/track" className="text-sm font-bold hover:text-accent-pink transition-colors">Track Donation</Link>
          <Link to="/map" className="text-sm font-bold hover:text-accent-pink transition-colors">Community Map</Link>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-black text-xs tracking-widest uppercase text-accent-green mb-2">Community &amp; Impact</h3>
          <Link to="/love" className="text-sm font-bold hover:text-accent-pink transition-colors">Wall of Love</Link>
          <Link to="/partner" className="text-sm font-bold hover:text-accent-pink transition-colors">Partner Org Application</Link>
          <Link to="/about" className="text-sm font-bold hover:text-accent-pink transition-colors">About reloved</Link>
          <Link to="/contact" className="text-sm font-bold hover:text-accent-pink transition-colors">Contact Us</Link>
        </div>

        <div className="flex flex-col gap-3">
          <h3 className="font-black text-xs tracking-widest uppercase text-accent-green mb-2">Pledge &amp; Standards</h3>
          <Link to="/standards" className="text-sm font-bold hover:text-accent-pink transition-colors">Quality Standards</Link>
          <Link to="/privacy" className="text-sm font-bold hover:text-accent-pink transition-colors">Privacy Policy</Link>
          <Link to="/terms" className="text-sm font-bold hover:text-accent-pink transition-colors">Terms & Conditions</Link>
        </div>
      </div>
      
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-white/20 flex flex-col md:flex-row justify-between items-center gap-4 text-xs font-mono text-white/50">
        <p>&copy; {new Date().getFullYear()} RE-LOVED DIGITAL &bull; Pre-Loved Goods for Free</p>
        <p>Technology partner: Totem Interactive</p>
      </div>
    </footer>
  )
}
