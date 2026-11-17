// functions/teach/index.js — đường `/teach` (không dấu gạch cuối).
// Không chắc Pages gắn `_middleware.js` của thư mục này cho `/teach` hay chỉ cho
// `/teach/*` (cùng câu hỏi đã gặp ở functions/quan-ly/index.js). File này đóng cả
// hai nhánh: nó CHẠY CHÍNH cổng gác đó (cùng một hàm, không chép logic), nên
// `/teach` không bao giờ ra nội dung mà không qua kiểm quyền. Không chuyển hướng,
// nên không thể vòng lặp với việc Pages tự thêm dấu gạch cuối.
export { onRequest } from './_middleware.js';
