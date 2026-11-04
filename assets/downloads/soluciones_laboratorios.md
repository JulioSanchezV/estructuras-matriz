# Soluciones de los laboratorios de trabajo

Consulte esta guía después de completar cada paso. No contiene una calificación. Los archivos resueltos incluyen verificaciones y límites del modelo. Python sigue siendo complementario.

## C1

```python
xy=np.array([[2.,0.],[0.,0.],[0.,2.]])
conectividad=[(0,1),(0,2),(1,2)]
geometria=np.array([[np.linalg.norm(xy[j]-xy[i]), *((xy[j]-xy[i])/np.linalg.norm(xy[j]-xy[i]))] for i,j in conectividad])
```

## C2

```python
E=1e6
def Kbarra(c,s):
    return E*.001*np.array([[c*c,c*s,-c*c,-c*s],[c*s,s*s,-c*s,-s*s],[-c*c,-c*s,c*c,c*s],[-c*s,-s*s,c*s,s*s]])
matrices=[Kbarra(c,s) for L,c,s in geometria]
```

## C3

```python
codigos=[[0,1,2,3],[0,1,4,5],[2,3,4,5]]
K=np.zeros((6,6))
for ids,k in zip(codigos,matrices):K[np.ix_(ids,ids)]+=k
n=np.array([0,1,3]);a=np.array([2,4,5])
Knn=K[np.ix_(n,n)]
```

## C4

```python
Fn=np.array([40.,-50.,0.])
dn=np.linalg.solve(Knn,Fn)
delta=np.zeros(6);delta[n]=dn
Fa=K[np.ix_(a,n)]@dn
S=np.array([E*.001*np.array([-c,-s,c,s])@delta[ids] for ids,(L,c,s) in zip(codigos,geometria)])
```

## V1

```python
L=4.5;voladizo=1.5;P=20.;EI=7290.
carga=np.array([0.,0.,-P,-P*voladizo])
```

## V2

```python
K=EI/L**3*np.array([[12,6*L,-12,6*L],[6*L,4*L*L,-6*L,2*L*L],[-12,-6*L,12,-6*L],[6*L,2*L*L,-6*L,4*L*L]])
n=np.array([3]);a=np.array([0,1,2])
Knn=K[np.ix_(n,n)];Fn=carga[n]
```

## V3

```python
dn=np.linalg.solve(Knn,Fn)
delta=np.zeros(4);delta[n]=dn
Fa=K[np.ix_(a,n)]@dn
reacciones=Fa-carga[a]
```

## P1

```python
E=19e6
xy=np.array([[0.,3.],[6.,3.],[0.,0.],[6.,0.]])
miembros=[(2,0,.09,.000675),(0,1,.15,.003125),(3,1,.09,.000675)]
def local(EA,EI,L):
    return np.array([[EA/L,0,0,-EA/L,0,0],[0,12*EI/L**3,6*EI/L**2,0,-12*EI/L**3,6*EI/L**2],[0,6*EI/L**2,4*EI/L,0,-6*EI/L**2,2*EI/L],[-EA/L,0,0,EA/L,0,0],[0,-12*EI/L**3,-6*EI/L**2,0,12*EI/L**3,-6*EI/L**2],[0,6*EI/L**2,2*EI/L,0,-6*EI/L**2,4*EI/L]])
```

## P2

```python
def transformar(c,s):
    R=np.array([[c,s,0],[-s,c,0],[0,0,1]])
    T=np.zeros((6,6));T[:3,:3]=R;T[3:,3:]=R
    return T
elementos=[];K=np.zeros((12,12))
for i,j,A,I in miembros:
    d=xy[j]-xy[i];L=np.linalg.norm(d);c,s=d/L
    T=transformar(c,s);Kbar=local(E*A,E*I,L)
    ids=np.array([3*i,3*i+1,3*i+2,3*j,3*j+1,3*j+2])
    K[np.ix_(ids,ids)]+=T.T@Kbar@T
    elementos.append(dict(ids=ids,T=T,Kbar=Kbar,L=L))
```

## P3

```python
w=25.;L=6.
FFbar_viga=np.array([0,w*L/2,w*L**2/12,0,w*L/2,-w*L**2/12])
FF=np.zeros(12);FF[elementos[1]['ids']]+=elementos[1]['T'].T@FFbar_viga
n=np.arange(6);a=np.arange(6,12)
Knn=K[np.ix_(n,n)]
dn=np.linalg.solve(Knn,-FF[n])
```

## P4

```python
delta=np.zeros(12);delta[n]=dn
Fa=FF[a]+K[np.ix_(a,n)]@dn
acciones=np.array([((FFbar_viga if k==1 else np.zeros(6))+el['Kbar']@el['T']@delta[el['ids']]) for k,el in enumerate(elementos)])
```

## Comprobaciones que deben explicarse

Cercha: v2 se desacopla, S23=0. Viga: Fa,B=10 kN pero YB=30 kN porque existe −20 kN sobre el apoyo. Pórtico: las bases equilibran150 kN, θ1=−θ2 y v1=v2. Las fuerzas se comparan sin redondear los desplazamientos intermedios.
