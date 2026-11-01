

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




# игнорирование фронтэнд файлов в бэке



tree -a -f --dirsfirst --prune \
  -P '*.py|*.sh|*.md|*.ini|*.conf|*.json|*.txt|requirements.lock|.gitignore|.env.example' \
  -I 'frontend|FRONT-FILES|node_modules|static|.next|out|dist|coverage|.turbo|.vercel|__pycache__|.git|.venv*|.pytest_cache|data/raw|data/voices|data/tmp|data/runtime|journal.json|project_contents.txt|save_project.sh|промпт.txt|cheat-sheet.md|TODO.MD|Instructions.md|архив' \
  .