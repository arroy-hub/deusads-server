import { iconStyle } from "../../../lib/category-icons";

/** The glyph of an ad category, the same one the developer sees next to a campaign. */
export default function CategoryIcon({ category, label }) {
  return <i className="cp-cti" style={category ? iconStyle(category) : iconStyle("other")} role="img" aria-label={label || "Category"} title={label || undefined} />;
}
