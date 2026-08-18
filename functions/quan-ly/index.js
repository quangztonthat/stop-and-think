// functions/quan-ly/index.js — xử lý đúng đường dẫn `/quan-ly` (KHÔNG dấu gạch cuối).
//
// Vì sao cần file này:
// `_redirects` có dòng `/quan-ly /quan-ly/comments.html 200`. Đó là rewrite ở
// tầng tệp tĩnh: URL giữ nguyên `/quan-ly` nhưng nội dung là comments.html.
// Mà `functions/quan-ly/_middleware.js` được Pages gắn cho tuyến `/quan-ly/*`,
// và `/quan-ly` không có dấu gạch cuối thì KHÔNG chắc khớp tuyến đó. Nếu không
// khớp, rewrite chạy và trang quản trị ra thẳng, không qua cổng gác nào — chỉ
// lộ khi đã gỡ chế độ bảo trì, nên hôm nay không đo được.
//
// Cách đóng không cần biết câu trả lời: Functions chạy TRƯỚC `_redirects`, nên
// file này chắc chắn nhận `/quan-ly`. Nó chỉ chuyển hướng sang
// `/quan-ly/comments.html` — đường đó chắc chắn khớp `/quan-ly/*` nên chắc
// chắn qua `_middleware.js`. Đúng ở cả hai nhánh routing, và không phải chép
// lại logic kiểm quyền ra đây (một nguồn sự thật vẫn là `_middleware.js`).
//
// KHÔNG xoá dòng trong `_redirects`: nếu file này bị gỡ, dòng đó vẫn là lối
// vào cũ, giữ nguyên hành vi Quang đang quen.
export function onRequest({ request }) {
  const u = new URL(request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/quan-ly/comments.html' + u.search,
      'cache-control': 'no-store',
    },
  });
}
