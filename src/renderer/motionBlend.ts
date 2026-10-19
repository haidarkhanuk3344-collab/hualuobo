type Mesh={width:number;height:number;a:number[];b:number[];triangles:number[]};
type Source=HTMLImageElement|HTMLCanvasElement;
/** Both textures share one interpolated silhouette and anatomical control mesh. */
export class MotionBlend {
 canvas=document.createElement('canvas');private gl:WebGLRenderingContext|null;private program:WebGLProgram|null=null;private images=new Map<Source,WebGLTexture>();private buffer:WebGLBuffer|null=null;private mix:WebGLUniformLocation|null=null;
 constructor(){
  const gl=this.canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,preserveDrawingBuffer:true,antialias:false});this.gl=gl;if(!gl)return;
  const shader=(kind:number,source:string)=>{const s=gl.createShader(kind)!;gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.error('Morph shader:',gl.getShaderInfoLog(s));return null;}return s;};
  const vs=shader(gl.VERTEX_SHADER,'attribute vec2 p;attribute vec2 ta;attribute vec2 tb;varying vec2 ua;varying vec2 ub;void main(){ua=ta;ub=tb;gl_Position=vec4(p,0.0,1.0);}');
  const fs=shader(gl.FRAGMENT_SHADER,`precision mediump float;varying vec2 ua;varying vec2 ub;uniform sampler2D a;uniform sampler2D b;uniform float t;
   void main(){vec4 ca=texture2D(a,ua),cb=texture2D(b,ub);gl_FragColor=mix(vec4(ca.rgb*ca.a,ca.a),vec4(cb.rgb*cb.a,cb.a),t);}`);
  if(!vs||!fs)return;const program=gl.createProgram()!;gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS)){console.error('Morph program:',gl.getProgramInfoLog(program));return;}
  this.program=program;this.buffer=gl.createBuffer();gl.useProgram(program);gl.uniform1i(gl.getUniformLocation(program,'a'),0);gl.uniform1i(gl.getUniformLocation(program,'b'),1);this.mix=gl.getUniformLocation(program,'t');
 }
 get available(){return !!this.program;}
 private texture(image:Source){const gl=this.gl!;let texture=this.images.get(image);if(!texture){texture=gl.createTexture()!;gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);this.images.set(image,texture);}else{gl.bindTexture(gl.TEXTURE_2D,texture);if(image instanceof HTMLCanvasElement)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);}return texture;}
 render(a:Source,b:Source,mesh:Mesh,t:number):Source{
  const gl=this.gl;if(!gl||!this.program||t<=0)return a;if(t>=1)return b;
  if(this.canvas.width!==a.width||this.canvas.height!==a.height){this.canvas.width=a.width;this.canvas.height=a.height;gl.viewport(0,0,a.width,a.height);}
  gl.useProgram(this.program);gl.activeTexture(gl.TEXTURE0);this.texture(a);gl.activeTexture(gl.TEXTURE1);this.texture(b);
  const data=new Float32Array(mesh.triangles.length*6),w=mesh.width,h=mesh.height;
  mesh.triangles.forEach((i,j)=>{const ax=mesh.a[i*2]/w,ay=mesh.a[i*2+1]/h,bx=mesh.b[i*2]/w,by=mesh.b[i*2+1]/h;data.set([(ax+(bx-ax)*t)*2-1,1-(ay+(by-ay)*t)*2,ax,ay,bx,by],j*6);});
  gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.DYNAMIC_DRAW);
  for(const [name,offset] of [['p',0],['ta',8],['tb',16]] as const){const index=gl.getAttribLocation(this.program,name);gl.enableVertexAttribArray(index);gl.vertexAttribPointer(index,2,gl.FLOAT,false,24,offset);}
  gl.uniform1f(this.mix,t);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,mesh.triangles.length);return this.canvas;
 }
}
