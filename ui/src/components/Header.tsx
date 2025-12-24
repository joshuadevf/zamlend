import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="header">
      <div className="header-container">
        <div className="header-content">
          <div className="header-left">
            <h1 className="header-title">ZamLend</h1>
            <p className="header-subtitle">Confidential ETH lending</p>
          </div>
          <ConnectButton />
        </div>
      </div>
    </header>
  );
}
