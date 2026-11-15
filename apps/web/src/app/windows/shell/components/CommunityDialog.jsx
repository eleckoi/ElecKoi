import { useProductTranslation } from "../../../i18n/ProductLocaleContext.jsx";
import { ELECKOI_FAILURE_CODES } from "@shared/contracts/errors/codes";
import { DesktopError } from "@shared/foundation/DesktopError";
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import '../../../../ui/styles/product-dialogs.css';
import { CopyIcon } from "../../../../ui/icons/index.jsx";
import { ELECKOI_QQ_GROUP_NUMBER } from "@shared/foundation/community";

export function CommunityDialog({ open, onClose, onNotify, onReportProblem }) {
  const tUi = useProductTranslation();
  async function copyGroupNumber(message = tUi("群号已复制")) {
    try {
      if (!navigator.clipboard?.writeText) throw new DesktopError(ELECKOI_FAILURE_CODES.inputUnsupported, "Clipboard API unavailable", { what: "剪贴板接口" });
      await navigator.clipboard.writeText(ELECKOI_QQ_GROUP_NUMBER);
      onNotify?.("success", message);
      return true;
    } catch {
      onNotify?.("error", tUi("复制失败，请手动复制群号 {value0}", {value0: ELECKOI_QQ_GROUP_NUMBER}));
      return false;
    }
  }

  return <Modal open={open} title={tUi('ElecKoi测试群')} description={tUi('交流使用体验与问题反馈')} closeLabel={tUi('关闭社区指引')} onClose={onClose}
    className="product-dialog" contentClassName="product-dialog-content" footer={<div className="product-dialog-actions">
      {onReportProblem && <Button variant="outline" onClick={() => onReportProblem()}>{tUi('报告问题')}</Button>}
      <Button variant="primary" onClick={() => copyGroupNumber()} icon={<CopyIcon />}>{tUi('复制群号')}</Button>
    </div>}>
        <div className="community-dialog-group-number">
          <span>{tUi("QQ群")}</span>
          <strong>{ELECKOI_QQ_GROUP_NUMBER}</strong>
        </div>
  </Modal>;
}
