import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import "./index.css";
import { locale, updateItem } from "@fortune-sheet/core";
import WorkbookContext from "../../context";
import Select, { Option } from "../Toolbar/Select";
import SVGIcon from "../SVGIcon";
import { useDialog } from "../../hooks/useDialog";
import { useEscapeToClose } from "../../hooks/useEscapeToClose";
import { useRovingFocus } from "../../hooks/useRovingFocus";
import { activateOnEnterOrSpace } from "../../utils/keyboardActivation";
import ConditionRules from "./ConditionRules";
import { MenuDivider } from "../Toolbar/Divider";

type SubmenuItem = {
  key: string;
  content: React.ReactNode;
  onClick: () => void;
  style?: React.CSSProperties;
};

const ConditionFormatSubmenuOption: React.FC<{
  label: React.ReactNode;
  width: number;
  items: SubmenuItem[];
}> = ({ label, width, items }) => {
  const { refs } = useContext(WorkbookContext);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // 子菜单溢出屏幕时，重新定位子菜单位置
  // re-position the subMenu if it oveflows the window
  useEffect(() => {
    const subMenu = menuRef.current;
    if (!subMenu || !open) return;
    const menuItem = subMenu.closest(
      ".fortune-toolbar-select-option"
    ) as HTMLDivElement | null;
    if (!menuItem) return;
    const menuItemRect = menuItem.getBoundingClientRect();
    const workbookContainerRect =
      refs.workbookContainer.current!.getBoundingClientRect();
    const menuItemStyle = window.getComputedStyle(menuItem);
    const menuItemPaddingRight = parseFloat(
      menuItemStyle.getPropertyValue("padding-right").replace("px", "")
    );
    const subMenuWidth = parseFloat(subMenu.style.width.replace("px", ""));
    if (workbookContainerRect.right - menuItemRect.right < subMenuWidth) {
      subMenu.style.right = `${menuItemRect.width - menuItemPaddingRight}px`;
    } else {
      subMenu.style.right = `${-(subMenuWidth + menuItemPaddingRight)}px`;
    }
  }, [open, refs.workbookContainer]);

  useEscapeToClose({
    open,
    onClose: () => setOpen(false),
    containerRef: menuRef,
  });
  useRovingFocus({
    containerRef: menuRef,
    orientation: "vertical",
    enabled: open,
  });

  return (
    <Option
      aria-haspopup
      aria-expanded={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }
      }}
    >
      <div className="fortune-toolbar-menu-line">
        {label}
        <SVGIcon name="rightArrow" width={18} />
        <div
          ref={menuRef}
          className="condition-format-sub-menu"
          style={{ display: open ? "block" : "none", width }}
        >
          {items.map((item) => (
            <div
              className="condition-format-item"
              key={item.key}
              style={item.style}
              onClick={item.onClick}
              onKeyDown={activateOnEnterOrSpace}
              tabIndex={0}
              role="button"
            >
              {item.content}
            </div>
          ))}
        </div>
      </div>
    </Option>
  );
};

const ConditionalFormat: React.FC<{
  items: string[];
  setOpen: React.Dispatch<React.SetStateAction<boolean>>;
}> = ({ items, setOpen }) => {
  const { context, setContext } = useContext(WorkbookContext);
  const { showDialog } = useDialog();
  const { conditionformat } = locale(context);

  // 获得条件格式
  const getConditionFormatItem = useCallback(
    (name: string) => {
      if (name === "-") {
        return <MenuDivider key={name} />;
      }
      if (name === "highlightCellRules") {
        return (
          <ConditionFormatSubmenuOption
            key={name}
            label={conditionformat[name]}
            width={150}
            items={[
              { text: "greaterThan", value: ">" },
              { text: "lessThan", value: "<" },
              { text: "between", value: "[]" },
              { text: "equal", value: "=" },
              { text: "textContains", value: "()" },
              {
                text: "occurrenceDate",
                value: conditionformat.yesterday,
              },
              { text: "duplicateValue", value: "##" },
            ].map((v) => ({
              key: v.text,
              content: (
                <>
                  {(conditionformat as any)[v.text]}
                  <span>{v.value}</span>
                </>
              ),
              onClick: () => {
                setOpen(false);
                showDialog(<ConditionRules type={v.text} />);
              },
            }))}
          />
        );
      }
      if (name === "itemSelectionRules") {
        return (
          <ConditionFormatSubmenuOption
            key={name}
            label={conditionformat[name]}
            width={180}
            items={[
              { text: "top10", value: conditionformat.top10 },
              {
                text: "top10_percent",
                value: conditionformat.top10_percent,
              },
              { text: "last10", value: conditionformat.last10 },
              {
                text: "last10_percent",
                value: conditionformat.last10_percent,
              },
              { text: "aboveAverage", value: conditionformat.above },
              { text: "belowAverage", value: conditionformat.below },
            ].map((v) => ({
              key: v.text,
              content: (
                <>
                  {(conditionformat as any)[v.text]}
                  <span>{v.value}</span>
                </>
              ),
              onClick: () => {
                setOpen(false);
                showDialog(<ConditionRules type={v.text} />);
              },
            }))}
          />
        );
      }
      if (name === "dataBar") {
        return (
          <div className="fortune-toolbar-menu-line" key={`div${name}`}>
            {conditionformat[name]}
            <SVGIcon name="rightArrow" width={18} />
          </div>
        );
      }
      if (name === "colorGradation") {
        return (
          <div className="fortune-toolbar-menu-line" key={`div${name}`}>
            {conditionformat[name]}
            <SVGIcon name="rightArrow" width={18} />
          </div>
        );
      }
      if (name === "icons") {
        return (
          <div className="fortune-toolbar-menu-line" key={`div${name}`}>
            {conditionformat[name]}
          </div>
        );
      }
      if (name === "newFormatRule") {
        return (
          <div className="fortune-toolbar-menu-line" key={`div${name}`}>
            {conditionformat[name]}
          </div>
        );
      }
      if (name === "deleteRule") {
        return (
          <ConditionFormatSubmenuOption
            key={name}
            label={conditionformat[name]}
            width={150}
            items={["deleteSheetRule"].map((v) => ({
              key: v,
              content: (conditionformat as any)[v],
              style: { padding: "6px 10px" },
              onClick: () => {
                setContext((ctx) => {
                  updateItem(ctx, "delSheet");
                });
              },
            }))}
          />
        );
      }
      if (name === "manageRules") {
        return (
          <div className="fortune-toolbar-menu-line" key={`div${name}`}>
            {conditionformat[name]}
          </div>
        );
      }

      return <div />;
    },
    [conditionformat, setContext, setOpen, showDialog]
  );

  return (
    <div className="condition-format">
      <Select style={{ overflow: "visible" }}>
        {items.map((v) => (
          <div key={`option${v}`}>{getConditionFormatItem(v)}</div>
        ))}
      </Select>
    </div>
  );
};

export default ConditionalFormat;
