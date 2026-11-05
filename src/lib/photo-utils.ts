const TYPES=['image/jpeg','image/png','image/webp']
export function checkImage(file:Pick<File,'type'|'size'>):string|null{
 if(!TYPES.includes(file.type))return 'Use JPG, PNG or WebP photos. Animated GIFs are not supported for privacy-safe uploads.'
 if(file.size<=0||file.size>10*1024*1024)return 'Each photo must be between 1 byte and 10 MB.'
 return null
}
