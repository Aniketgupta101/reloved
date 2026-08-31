import { Link } from "react-router-dom"

export const RELOVED_ACCEPT_DISCLAIMER =
  'By clicking “I Accept,” you agree to the RELOVED Terms & Conditions. RELOVED is a platform that facilitates the giving and claiming of preloved items and is not the owner, seller, buyer, or guarantor of any item. Items are offered and claimed on an “as is” basis. RELOVED does not inspect, authenticate or guarantee the condition, quality, authenticity, safety or suitability of any item and, to the extent permitted by law, is not responsible for any loss, damage, injury, dispute or claim arising from items or interactions between users.'

export const PERSONAL_USE_LABEL =
  "I confirm this item is for personal use only and will not be sold, traded for money, or used commercially."

export const GIVE_DECLARATION_LABEL =
  "I confirm the item is clean, safe, fully usable, and not materially torn or stained. I am giving it freely without receiving payment."

type LegalAcceptProps = {
  accepted: boolean
  onAcceptedChange: (value: boolean) => void
  /** Give flow quality / free-gift declaration. */
  showDeclaration?: boolean
  declaration?: boolean
  onDeclarationChange?: (value: boolean) => void
  declarationLabel?: string
  /** Extra required declaration (e.g. personal use on claim). */
  personalUse?: boolean
  onPersonalUseChange?: (value: boolean) => void
  showPersonalUse?: boolean
  className?: string
  idPrefix?: string
}

/** Shared T&C / Privacy accept block for Give + Claim. Disclaimer first, then all checkboxes at the bottom. */
export function LegalAccept({
  accepted,
  onAcceptedChange,
  showDeclaration = false,
  declaration = false,
  onDeclarationChange,
  declarationLabel = GIVE_DECLARATION_LABEL,
  personalUse = false,
  onPersonalUseChange,
  showPersonalUse = false,
  className = "",
  idPrefix = "legal",
}: LegalAcceptProps) {
  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed border-2 border-foreground bg-surface-muted p-3 sm:p-4">
        {RELOVED_ACCEPT_DISCLAIMER}
      </p>

      <div className="flex flex-col gap-3">
        {showDeclaration && onDeclarationChange && (
          <label
            htmlFor={`${idPrefix}-declaration`}
            className="flex items-start gap-3 p-3 sm:p-4 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5"
          >
            <input
              id={`${idPrefix}-declaration`}
              type="checkbox"
              checked={declaration}
              onChange={(e) => onDeclarationChange(e.target.checked)}
              className="mt-1 w-5 h-5 shrink-0 rounded-none border-2 border-foreground"
            />
            <span className="text-sm font-medium leading-snug">{declarationLabel}</span>
          </label>
        )}

        {showPersonalUse && onPersonalUseChange && (
          <label
            htmlFor={`${idPrefix}-personal-use`}
            className="flex items-start gap-3 p-3 sm:p-4 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5"
          >
            <input
              id={`${idPrefix}-personal-use`}
              type="checkbox"
              checked={personalUse}
              onChange={(e) => onPersonalUseChange(e.target.checked)}
              className="mt-1 w-5 h-5 shrink-0 rounded-none border-2 border-foreground"
            />
            <span className="text-sm font-medium leading-snug">{PERSONAL_USE_LABEL}</span>
          </label>
        )}

        <label
          htmlFor={`${idPrefix}-terms`}
          className="flex items-start gap-3 p-3 sm:p-4 border-2 border-foreground bg-white cursor-pointer hover:bg-black/5"
        >
          <input
            id={`${idPrefix}-terms`}
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAcceptedChange(e.target.checked)}
            className="mt-1 w-5 h-5 shrink-0 rounded-none border-2 border-foreground"
          />
          <span className="text-sm font-medium leading-snug">
            I have read and agree to the RELOVED{" "}
            <Link to="/terms" target="_blank" className="underline font-bold hover:text-accent-pink" onClick={(e) => e.stopPropagation()}>
              Terms & Conditions
            </Link>{" "}
            and{" "}
            <Link to="/privacy" target="_blank" className="underline font-bold hover:text-accent-pink" onClick={(e) => e.stopPropagation()}>
              Privacy Policy
            </Link>
            .
          </span>
        </label>
      </div>
    </div>
  )
}
