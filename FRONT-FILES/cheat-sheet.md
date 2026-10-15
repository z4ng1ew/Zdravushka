

#  Главная команда tree — только исходники


tree --dirsfirst \
  -I 'node_modules|.next|out|dist|build|coverage|.git|.turbo|.cache|.vercel|__pycache__|package-lock.json|next-env.d.ts|*.tsbuildinfo|.env|.env.*' \
  -P '*.ts|*.tsx|*.js|*.jsx|*.mjs|*.css|*.json|*.md' \
  --prune





  # для запуска


  npm install

   npm run dev


# собрать фронт в static/

   npm run export